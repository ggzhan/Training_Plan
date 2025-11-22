package com.example.trainingplanner.model;

import com.opencsv.bean.CsvBindByName;
import java.util.Objects;

public class Exercise {
    @CsvBindByName(column = "NAME")
    private String name;

    @CsvBindByName(column = "DURATIONMINUTES")
    private int durationMinutes;

    @CsvBindByName(column = "MINPLAYERS")
    private int minPlayers;

    @CsvBindByName(column = "MAXPLAYERS")
    private int maxPlayers;

    @CsvBindByName(column = "TYPE")
    private String type; // e.g., "Warmup", "Drill", "Scrimmage"

    @CsvBindByName(column = "DESCRIPTION")
    private String description;

    public Exercise() {
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(int durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public int getMinPlayers() {
        return minPlayers;
    }

    public void setMinPlayers(int minPlayers) {
        this.minPlayers = minPlayers;
    }

    public int getMaxPlayers() {
        return maxPlayers;
    }

    public void setMaxPlayers(int maxPlayers) {
        this.maxPlayers = maxPlayers;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Exercise exercise = (Exercise) o;
        return durationMinutes == exercise.durationMinutes &&
                minPlayers == exercise.minPlayers &&
                maxPlayers == exercise.maxPlayers &&
                Objects.equals(name, exercise.name) &&
                Objects.equals(type, exercise.type) &&
                Objects.equals(description, exercise.description);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, durationMinutes, minPlayers, maxPlayers, type, description);
    }

    @Override
    public String toString() {
        return "Exercise{" +
                "name='" + name + '\'' +
                ", durationMinutes=" + durationMinutes +
                ", minPlayers=" + minPlayers +
                ", maxPlayers=" + maxPlayers +
                ", type='" + type + '\'' +
                ", description='" + description + '\'' +
                '}';
    }
}
