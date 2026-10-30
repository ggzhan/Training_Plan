package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads the kids and trainings from a Google Sheet. Columns are found by their
 * header: "Elo" (or the older "Klassierung"), "Name" and an optional "Vorname";
 * every column after them is one training, either a date ("3. Oktober") or a
 * weekday group ("Montag", "Mittwoch früh"). A plain "X" marks who comes.
 *
 * The sheet and its header row are set per site (trainingsplan.sheet.id / .range),
 * so stutzpunkt.gxz.ch and spinners.gxz.ch run the same code on different sheets.
 */
@Service
public class GoogleSheetsService {

    private static final Map<String, DayOfWeek> WEEKDAYS = Map.of(
            "montag", DayOfWeek.MONDAY, "dienstag", DayOfWeek.TUESDAY, "mittwoch", DayOfWeek.WEDNESDAY,
            "donnerstag", DayOfWeek.THURSDAY, "freitag", DayOfWeek.FRIDAY, "samstag", DayOfWeek.SATURDAY,
            "sonntag", DayOfWeek.SUNDAY);

    private final String sheetsUrl;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Cache
    private JsonNode cachedData;
    private LocalDateTime lastRefresh;
    private final Map<String, List<Player>> playerCache = new HashMap<>();

    // Defaults: the Stützpunkt sheet, whose header sits on row 8 below the location/legend rows
    public GoogleSheetsService(
            @Value("${trainingsplan.sheet.id:1eMKvroU-GRNI3SszjwAQxxVhSEHeV0b4sjFYNh1BFmo}") String sheetId,
            @Value("${trainingsplan.sheet.range:A8:Z}") String range) {
        String url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/gviz/tq?tqx=out:json";
        this.sheetsUrl = range == null || range.isBlank() ? url : url + "&range=" + range + "&headers=1";
    }

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
            String response = restTemplate.getForObject(sheetsUrl, String.class);
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

    /** Where the Elo, name and first-name columns are, and where the trainings start. */
    private record Columns(int elo, int name, int firstName, int firstTraining) {
    }

    private Columns columns(JsonNode cols) {
        int elo = -1;
        int name = -1;
        int firstName = -1;
        for (int i = 0; i < cols.size(); i++) {
            String label = cols.get(i).get("label").asText().trim().toLowerCase(Locale.ROOT);
            if (elo == -1 && (label.equals("elo") || label.equals("klassierung"))) {
                elo = i;
            } else if (name == -1 && label.equals("name")) {
                name = i;
            } else if (firstName == -1 && label.equals("vorname")) {
                firstName = i;
            }
        }
        if (elo == -1 || name == -1) {
            // Header not recognised: assume the original "Elo, Name, <trainings>" layout
            return new Columns(0, 1, -1, 2);
        }
        return new Columns(elo, name, firstName, Math.max(Math.max(elo, name), firstName) + 1);
    }

    public List<String> getTrainingDates() {
        if (cachedData == null) {
            refreshData();
        }

        try {
            List<String> dates = new ArrayList<>();
            JsonNode cols = cachedData.get("table").get("cols");
            for (int i = columns(cols).firstTraining(); i < cols.size(); i++) {
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

    /** The training closest to today: a date ("3. Oktober") or the next such weekday ("Montag"). */
    public String getNextTrainingDate() {
        List<String> dates = getTrainingDates();
        if (dates.isEmpty()) {
            return null;
        }

        LocalDate today = LocalDate.now();
        String closestDate = dates.get(0);
        long minDifference = Long.MAX_VALUE;

        for (String dateStr : dates) {
            LocalDate trainingDate = trainingDay(dateStr, today);
            if (trainingDate == null) {
                continue;
            }
            long difference = Math.abs(ChronoUnit.DAYS.between(today, trainingDate));
            if (difference < minDifference) {
                minDifference = difference;
                closestDate = dateStr;
            }
        }
        return closestDate;
    }

    private static LocalDate trainingDay(String label, LocalDate today) {
        String first = label.trim().split("\\s+")[0].toLowerCase(Locale.GERMAN);
        DayOfWeek weekday = WEEKDAYS.get(first);
        if (weekday != null) {
            return today.with(TemporalAdjusters.nextOrSame(weekday));
        }
        try {
            // Drop location suffixes such as "15. Mai (SG)"
            String plainDate = label.replaceAll("\\s*\\(.*\\)\\s*$", "");
            LocalDate date = LocalDate.parse(plainDate + " " + today.getYear(),
                    DateTimeFormatter.ofPattern("d. MMMM yyyy", Locale.GERMAN));
            // A date already past belongs to next year
            return date.isBefore(today) ? date.plusYears(1) : date;
        } catch (Exception e) {
            System.err.println("Failed to parse date: " + label + " - " + e.getMessage());
            return null;
        }
    }

    public List<Player> readPlayersForDate(String targetDate) {
        if (playerCache.containsKey(targetDate)) {
            return playerCache.get(targetDate);
        }

        if (cachedData == null) {
            refreshData();
        }

        try {
            JsonNode cols = cachedData.get("table").get("cols");
            Columns layout = columns(cols);
            int dateColumnIndex = -1;
            for (int i = layout.firstTraining(); i < cols.size(); i++) {
                if (cols.get(i).get("label").asText().equals(targetDate)) {
                    dateColumnIndex = i;
                    break;
                }
            }
            if (dateColumnIndex == -1) {
                return new ArrayList<>();
            }

            List<Player> players = new ArrayList<>();
            for (JsonNode row : cachedData.get("table").get("rows")) {
                JsonNode cells = row.get("c");
                if (cells.size() <= dateColumnIndex) {
                    continue;
                }

                String name = text(cells, layout.name());
                // Skip special rows
                if (name.isEmpty() || name.equals("Freie Plätze") || name.startsWith("Max Teilnehmer")
                        || name.matches("\\d+")) {
                    continue;
                }
                if (layout.firstName() != -1) {
                    name = (text(cells, layout.firstName()) + " " + name).trim();
                }

                // Only a plain "X" counts; "X(1)" is a waitlist position
                if (text(cells, dateColumnIndex).equalsIgnoreCase("X")) {
                    JsonNode eloCell = cells.get(layout.elo());
                    int elo = eloCell != null && !eloCell.isNull() && eloCell.has("v") && !eloCell.get("v").isNull()
                            ? (int) eloCell.get("v").asDouble()
                            : 0;
                    players.add(new Player(name, elo));
                }
            }

            playerCache.put(targetDate, players);
            return players;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private static String text(JsonNode cells, int index) {
        JsonNode cell = cells.get(index);
        if (cell == null || cell.isNull() || !cell.has("v") || cell.get("v").isNull()) {
            return "";
        }
        return cell.get("v").asText().trim();
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
