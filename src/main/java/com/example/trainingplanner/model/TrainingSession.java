package com.example.trainingplanner.model;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public class TrainingSession {
    private int totalDuration;
    private int playerCount;
    private String notes;
    private List<Exercise> exercises;
    private Map<Exercise, List<PlayerPair>> exercisePairs;
    private Map<Exercise, Player> unpairedPlayers;
    private Map<Exercise, Integer> exerciseDiffSums; // Sum of Klassierung differences for each exercise

    public TrainingSession() {
    }

    public int getTotalDuration() {
        return totalDuration;
    }

    public void setTotalDuration(int totalDuration) {
        this.totalDuration = totalDuration;
    }

    public int getPlayerCount() {
        return playerCount;
    }

    public void setPlayerCount(int playerCount) {
        this.playerCount = playerCount;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public List<Exercise> getExercises() {
        return exercises;
    }

    public void setExercises(List<Exercise> exercises) {
        this.exercises = exercises;
    }

    public Map<Exercise, List<PlayerPair>> getExercisePairs() {
        return exercisePairs;
    }

    public void setExercisePairs(Map<Exercise, List<PlayerPair>> exercisePairs) {
        this.exercisePairs = exercisePairs;
    }

    public Map<Exercise, Player> getUnpairedPlayers() {
        return unpairedPlayers;
    }

    public void setUnpairedPlayers(Map<Exercise, Player> unpairedPlayers) {
        this.unpairedPlayers = unpairedPlayers;
    }

    public Map<Exercise, Integer> getExerciseDiffSums() {
        return exerciseDiffSums;
    }

    public void setExerciseDiffSums(Map<Exercise, Integer> exerciseDiffSums) {
        this.exerciseDiffSums = exerciseDiffSums;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        TrainingSession that = (TrainingSession) o;
        return totalDuration == that.totalDuration &&
                playerCount == that.playerCount &&
                Objects.equals(notes, that.notes) &&
                Objects.equals(exercises, that.exercises) &&
                Objects.equals(exercisePairs, that.exercisePairs) &&
                Objects.equals(unpairedPlayers, that.unpairedPlayers) &&
                Objects.equals(exerciseDiffSums, that.exerciseDiffSums);
    }

    @Override
    public int hashCode() {
        return Objects.hash(totalDuration, playerCount, notes, exercises, exercisePairs, unpairedPlayers,
                exerciseDiffSums);
    }

    @Override
    public String toString() {
        return "TrainingSession{" +
                "totalDuration=" + totalDuration +
                ", playerCount=" + playerCount +
                ", notes='" + notes + '\'' +
                ", exercises=" + exercises +
                ", exercisePairs=" + exercisePairs +
                ", unpairedPlayers=" + unpairedPlayers +
                ", exerciseDiffSums=" + exerciseDiffSums +
                '}';
    }
}
