package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
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
        System.out.println("Scheduled refresh triggered at: " + LocalDateTime.now());
        refreshData();
    }

    // Manual refresh method
    public synchronized void refreshData() {
        try {
            System.out.println("Fetching data from Google Sheets...");
            String response = restTemplate.getForObject(SHEETS_URL, String.class);
            cachedData = parseGoogleSheetsResponse(response);
            lastRefresh = LocalDateTime.now();
            playerCache.clear(); // Clear player cache when data is refreshed
            System.out.println("Data refreshed successfully at: " + lastRefresh);
        } catch (Exception e) {
            System.err.println("Error refreshing data: " + e.getMessage());
            e.printStackTrace();
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
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    public String getNextTrainingDate() {
        List<String> dates = getTrainingDates();
        return dates.isEmpty() ? null : dates.get(0);
    }

    public List<Player> readPlayersForDate(String targetDate) {
        // Check cache first
        if (playerCache.containsKey(targetDate)) {
            System.out.println("Returning cached players for " + targetDate);
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
                System.out.println("Date not found: " + targetDate);
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
                        System.out.println("  Added player: " + name + " (Klassierung: " + klassierung
                                + ", Availability: " + availability + ")");
                    }
                }
            }

            // Cache the result
            playerCache.put(targetDate, players);
            System.out.println("Loaded " + players.size() + " players for " + targetDate);
            return players;
        } catch (Exception e) {
            e.printStackTrace();
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
