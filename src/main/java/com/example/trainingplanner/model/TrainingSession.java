package com.example.trainingplanner.model;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public class TrainingSession {
    private int numberOfExercises;
    private int totalDuration;
    private int playerCount;
    private String notes;
    private Map<Integer, List<PlayerPair>> exercisePairs;
    private Map<Integer, Player> unpairedPlayers;

    public TrainingSession() {
    }

    public int getNumberOfExercises() {
        return numberOfExercises;
    }

    public void setNumberOfExercises(int numberOfExercises) {
        this.numberOfExercises = numberOfExercises;
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

    public Map<Integer, List<PlayerPair>> getExercisePairs() {
        return exercisePairs;
    }

    public void setExercisePairs(Map<Integer, List<PlayerPair>> exercisePairs) {
        this.exercisePairs = exercisePairs;
    }

    public Map<Integer, Player> getUnpairedPlayers() {
        return unpairedPlayers;
    }

    public void setUnpairedPlayers(Map<Integer, Player> unpairedPlayers) {
        this.unpairedPlayers = unpairedPlayers;
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
                numberOfExercises == that.numberOfExercises &&
                Objects.equals(notes, that.notes) &&
                Objects.equals(exercisePairs, that.exercisePairs) &&
                Objects.equals(unpairedPlayers, that.unpairedPlayers);
    }

    @Override
    public int hashCode() {
        return Objects.hash(numberOfExercises, totalDuration, playerCount, notes, exercisePairs, unpairedPlayers);
    }

    @Override
    public String toString() {
        return "TrainingSession{" + "numberOfExercises=" + numberOfExercises + ", totalDuration=" + totalDuration
                + ", playerCount="
                + playerCount + ", notes='" + notes + '\'' + ", exercisePairs=" + exercisePairs + ", unpairedPlayers="
                + unpairedPlayers + '}';
    }
}
