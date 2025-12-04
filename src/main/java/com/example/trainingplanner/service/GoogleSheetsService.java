package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class GoogleSheetsService {

    private static final String SHEETS_URL = "https://docs.google.com/spreadsheets/d/1gbevNRuWtom10K-bJVvTUc9MuD5i6SaH2BdrFoKWw0I/gviz/tq?tqx=out:json";
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Cache
    private JsonNode cachedData;
    private LocalDateTime lastRefresh;
    private final Map<String, List<Player>> playerCache = new HashMap<>();

    @PostConstruct
    public void init() {
        refreshData();
    }

    // Refresh data every 15 minutes (900000 ms)
    @Scheduled(fixedRate = 900000)
    public void scheduledRefresh() {

        refreshData();
    }

    // Manual refresh method
    public synchronized void refreshData() {
        try {

            String response = restTemplate.getForObject(SHEETS_URL, String.class);
            cachedData = parseGoogleSheetsResponse(response);
            lastRefresh = LocalDateTime.now();
            playerCache.clear(); // Clear player cache when data is refreshed

        } catch (Exception e) {
            System.err.println("Error refreshing data: " + e.getMessage());

        }
    }

    public LocalDateTime getLastRefreshTime() {
        return lastRefresh;
    }

    public List<String> getTrainingDates() {
        if (cachedData == null) {
            refreshData();
        }

        try {
            List<String> dates = new ArrayList<>();
            JsonNode cols = cachedData.get("table").get("cols");

            // Skip first two columns (Klassierung, Name), rest are dates
            for (int i = 2; i < cols.size(); i++) {
                String dateLabel = cols.get(i).get("label").asText();
                if (!dateLabel.isEmpty()) {
                    dates.add(dateLabel);
                }
            }

            return dates;
        } catch (Exception e) {

            return new ArrayList<>();
        }
    }

    public String getNextTrainingDate() {
        List<String> dates = getTrainingDates();
        if (dates.isEmpty()) {
            return null;
        }

        // Get today's date
        LocalDate today = LocalDate.now();
        int currentYear = today.getYear();

        // Format: "d. MMMM" (e.g., "20. September" or "1. November") with German month
        // names
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("d. MMMM", java.util.Locale.GERMAN);

        String closestDate = dates.get(0);
        long minDifference = Long.MAX_VALUE;

        for (String dateStr : dates) {
            try {
                // Parse the date string (format: "d. MMMM")
                // We need to add a year to parse it properly
                LocalDate trainingDate = LocalDate.parse(dateStr + " " + currentYear,
                        DateTimeFormatter.ofPattern("d. MMMM yyyy", java.util.Locale.GERMAN));

                // If the date is in the past, assume it's for next year
                if (trainingDate.isBefore(today)) {
                    trainingDate = trainingDate.plusYears(1);
                }

                // Calculate absolute difference in days
                long difference = Math.abs(ChronoUnit.DAYS.between(today, trainingDate));

                // Update if this date is closer
                if (difference < minDifference) {
                    minDifference = difference;
                    closestDate = dateStr;
                }
            } catch (Exception e) {
                // If parsing fails, skip this date
                System.err.println("Failed to parse date: " + dateStr + " - " + e.getMessage());
            }
        }

        return closestDate;
    }

    public List<Player> readPlayersForDate(String targetDate) {
        // Check cache first
        if (playerCache.containsKey(targetDate)) {

            return playerCache.get(targetDate);
        }

        if (cachedData == null) {
            refreshData();
        }

        try {
            // Find the column index for the target date
            JsonNode cols = cachedData.get("table").get("cols");
            int dateColumnIndex = -1;
            for (int i = 0; i < cols.size(); i++) {
                if (cols.get(i).get("label").asText().equals(targetDate)) {
                    dateColumnIndex = i;
                    break;
                }
            }

            if (dateColumnIndex == -1) {

                return new ArrayList<>();
            }

            List<Player> players = new ArrayList<>();
            JsonNode rows = cachedData.get("table").get("rows");

            for (JsonNode row : rows) {
                JsonNode cells = row.get("c");

                // Skip if not enough cells
                if (cells.size() <= dateColumnIndex) {
                    continue;
                }

                // Get name (column index 1)
                JsonNode nameCell = cells.get(1);
                if (nameCell == null || nameCell.isNull() || !nameCell.has("v")) {
                    continue;
                }

                String name = nameCell.get("v").asText();

                // Skip special rows
                if (name.equals("Freie Plätze") || name.equals("Max Teilnehmer pro Training") || name.matches("\\d+")) {
                    continue;
                }

                // Check availability for the target date
                JsonNode availabilityCell = cells.get(dateColumnIndex);
                if (availabilityCell != null && !availabilityCell.isNull() && availabilityCell.has("v")) {
                    String availability = availabilityCell.get("v").asText();

                    // Only accept exactly "X" (case-insensitive, trimmed)
                    // Excludes: X(1), W(1), x(2), etc.
                    if (availability != null && availability.trim().equalsIgnoreCase("X")) {
                        // Get Klassierung (column index 0)
                        int klassierung = 0;
                        JsonNode klassierungCell = cells.get(0);
                        if (klassierungCell != null && !klassierungCell.isNull() && klassierungCell.has("v")) {
                            klassierung = (int) klassierungCell.get("v").asDouble();
                        }

                        players.add(new Player(name, klassierung));

                    }
                }
            }

            // Cache the result
            playerCache.put(targetDate, players);

            return players;
        } catch (Exception e) {

            return new ArrayList<>();
        }
    }

    private JsonNode parseGoogleSheetsResponse(String response) throws Exception {
        // Google Sheets returns: google.visualization.Query.setResponse({...});
        // We need to extract the JSON part
        String jsonStart = "google.visualization.Query.setResponse(";
        String jsonEnd = ");";

        int startIndex = response.indexOf(jsonStart) + jsonStart.length();
        int endIndex = response.lastIndexOf(jsonEnd);

        String jsonString = response.substring(startIndex, endIndex);
        return objectMapper.readTree(jsonString);
    }
}
