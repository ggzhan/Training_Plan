package com.example.trainingplanner.model;

import com.opencsv.bean.CsvBindByName;
import java.util.Objects;

public class Exercise {
    @CsvBindByName(column = "Name")
    private String name;

    @CsvBindByName(column = "Description")
    private String description;

    @CsvBindByName(column = "Type")
    private String type;

    @CsvBindByName(column = "Duration")
    private int durationMinutes;

    public Exercise() {
    }

    public Exercise(String name, String description, String type, int durationMinutes) {
        this.name = name;
        this.description = description;
        this.type = type;
        this.durationMinutes = durationMinutes;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(int durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Exercise exercise = (Exercise) o;
        return durationMinutes == exercise.durationMinutes &&
                Objects.equals(name, exercise.name) &&
                Objects.equals(description, exercise.description) &&
                Objects.equals(type, exercise.type);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, description, type, durationMinutes);
    }

    @Override
    public String toString() {
        return "Exercise{" +
                "name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", type='" + type + '\'' +
                ", durationMinutes=" + durationMinutes +
                '}';
    }
}
