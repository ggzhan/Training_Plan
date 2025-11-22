package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class CsvService {

    private static final String PLAYERS_FILE = "Einteilung.csv";

    public List<Player> readPlayers() {
        Path path = Paths.get(PLAYERS_FILE);
        if (!Files.exists(path)) {
            return new ArrayList<>();
        }

        List<Player> players = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(PLAYERS_FILE))) {
            String line;
            int lineNumber = 0;

            while ((line = reader.readLine()) != null) {
                lineNumber++;

                // Skip header row (line 1) and "Freie Plätze" row (line 2)
                if (lineNumber <= 2) {
                    continue;
                }

                // Skip empty lines or lines that don't contain player data
                if (line.trim().isEmpty()) {
                    continue;
                }

                // Extract player name (first column before the first comma)
                String[] parts = line.split(",", 2);
                if (parts.length > 0 && !parts[0].trim().isEmpty()) {
                    String playerName = parts[0].trim();

                    // Skip footer rows and numeric-only values
                    if (!playerName.equals("Max Teilnehmer pro Training") && !playerName.matches("\\d+")) {
                        players.add(new Player(playerName));
                    }
                }
            }

            System.out.println("Loaded " + players.size() + " players:");
            players.forEach(System.out::println);
            return players;
        } catch (IOException e) {
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    public List<String> getTrainingDates() {
        Path path = Paths.get(PLAYERS_FILE);
        if (!Files.exists(path)) {
            return new ArrayList<>();
        }

        try (BufferedReader reader = new BufferedReader(new FileReader(PLAYERS_FILE))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                return new ArrayList<>();
            }

            // Split header and skip first column (Name)
            String[] headers = headerLine.split(",");
            List<String> dates = new ArrayList<>();
            LocalDate today = LocalDate.now();

            // Date format: "22. November" -> parse to LocalDate
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("d. MMMM", Locale.GERMAN);

            for (int i = 1; i < headers.length; i++) {
                String dateStr = headers[i].trim();
                if (!dateStr.isEmpty() && !dateStr.equals("Name")) {
                    try {
                        // Parse date (assumes current year)
                        LocalDate date = LocalDate.parse(dateStr, formatter).withYear(today.getYear());

                        // If the date is in the past but within the same year, try next year
                        if (date.isBefore(today)) {
                            date = date.plusYears(1);
                        }

                        // Only add if today or future
                        if (!date.isBefore(today)) {
                            dates.add(dateStr);
                        }
                    } catch (DateTimeParseException e) {
                        // If parsing fails, include the date anyway
                        dates.add(dateStr);
                    }
                }
            }
            return dates;
        } catch (IOException e) {
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    public String getNextTrainingDate() {
        List<String> dates = getTrainingDates();
        if (dates.isEmpty()) {
            return null;
        }
        // For now, return the first date (can be enhanced with date comparison)
        return dates.get(0);
    }

    public List<Player> readPlayersForDate(String targetDate) {
        Path path = Paths.get(PLAYERS_FILE);
        if (!Files.exists(path)) {
            return new ArrayList<>();
        }

        List<Player> players = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(PLAYERS_FILE))) {
            // Read header to find date column index
            String headerLine = reader.readLine();
            if (headerLine == null) {
                return new ArrayList<>();
            }

            String[] headers = headerLine.split(",");
            int dateColumnIndex = -1;
            for (int i = 0; i < headers.length; i++) {
                if (headers[i].trim().equals(targetDate)) {
                    dateColumnIndex = i;
                    break;
                }
            }

            if (dateColumnIndex == -1) {
                System.out.println("Date not found: " + targetDate);
                return new ArrayList<>();
            }

            // Skip "Freie Plätze" row
            reader.readLine();

            String line;
            int lineNumber = 2; // Already read 2 lines

            while ((line = reader.readLine()) != null) {
                lineNumber++;

                // Skip empty lines
                if (line.trim().isEmpty()) {
                    continue;
                }

                String[] parts = line.split(",", -1); // -1 to keep empty trailing fields
                if (parts.length > 0 && !parts[0].trim().isEmpty()) {
                    String playerName = parts[0].trim();

                    // Skip footer rows and numeric-only values
                    if (!playerName.equals("Max Teilnehmer pro Training") && !playerName.matches("\\d+")) {
                        // Check if player is available for this date
                        if (dateColumnIndex < parts.length) {
                            String availability = parts[dateColumnIndex].trim();
                            // Check for 'X', 'x', or 'x(n)' patterns
                            if (availability.matches("(?i)x.*")) {
                                players.add(new Player(playerName));
                            }
                        }
                    }
                }
            }

            System.out.println("Loaded " + players.size() + " players for date: " + targetDate);
            players.forEach(System.out::println);
            return players;
        } catch (IOException e) {
            e.printStackTrace();
            return new ArrayList<>();
        }
    }
}
