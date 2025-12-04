package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.MonthDay;
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

            players.forEach(System.out::println);
            return players;
        } catch (IOException e) {

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
                        MonthDay monthDay = MonthDay.parse(dateStr, formatter);
                        LocalDate date = monthDay.atYear(today.getYear());

                        // If the date is in the past but within the same year, try next year
                        if (date.isBefore(today)) {
                            date = date.plusYears(1);
                        }

                        // Only add if today or future
                        if (!date.isBefore(today)) {
                            dates.add(dateStr);
                        } else {

                        }
                    } catch (DateTimeParseException e) {
                        // If parsing fails, include the date anyway

                        dates.add(dateStr);
                    }
                }
            }

            return dates;
        } catch (IOException e) {

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

    public List<Exercise> readExercises() {
        Path path = Paths.get("Exercises.csv");
        if (!Files.exists(path)) {
            return new ArrayList<>();
        }

        List<com.example.trainingplanner.model.Exercise> exercises = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("Exercises.csv"))) {
            String line;
            // Skip header
            reader.readLine();

            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty())
                    continue;

                String[] parts = line.split(",", -1);
                if (parts.length >= 4) {
                    String name = parts[0].trim();
                    String description = parts[1].trim();
                    String type = parts[2].trim();
                    int duration = 15; // Default
                    try {
                        duration = Integer.parseInt(parts[3].trim());
                    } catch (NumberFormatException e) {
                        // Use default
                    }

                    com.example.trainingplanner.model.Exercise exercise = new com.example.trainingplanner.model.Exercise();
                    exercise.setName(name);
                    exercise.setDescription(description);
                    exercise.setType(type);
                    exercise.setDurationMinutes(duration);
                    exercises.add(exercise);
                }
            }
            return exercises;
        } catch (IOException e) {

            return new ArrayList<>();
        }
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

                return new ArrayList<>();
            }

            String line;
            while ((line = reader.readLine()) != null) {
                // Skip empty lines
                if (line.trim().isEmpty()) {
                    continue;
                }

                String[] columns = line.split(",", -1);

                // Skip rows that don't have enough columns
                if (columns.length <= dateColumnIndex) {
                    continue;
                }

                // Skip footer rows (e.g. "Max Teilnehmer pro Training")
                if (columns.length > 1 && columns[1].startsWith("Max Teilnehmer")) {
                    continue;
                }

                // Skip "Freie Plätze" row
                if (columns.length > 1 && columns[1].trim().equals("Freie Plätze")) {
                    continue;
                }

                String name = columns[1].trim(); // Name is now in column 1 (index 1)

                // Skip empty names or numeric-only names (like row numbers if any)
                if (name.isEmpty() || name.matches("\\d+")) {
                    continue;
                }

                String availability = columns[dateColumnIndex].trim();

                // Check availability (X or x(n))
                if (availability.equalsIgnoreCase("X") || availability.toLowerCase().startsWith("x(")) {
                    int elo = 0;
                    try {
                        // Parse Elo from column 0
                        String eloStr = columns[0].trim();
                        if (!eloStr.isEmpty()) {
                            elo = Integer.parseInt(eloStr);
                        }
                    } catch (NumberFormatException e) {
                        // Default to 0 if parsing fails
                        System.err.println("Failed to parse Elo for player " + name + ": " + columns[0]);
                    }
                    players.add(new Player(name, elo));
                }
            }

            return players;
        } catch (IOException e) {

            return new ArrayList<>();
        }
    }
}
