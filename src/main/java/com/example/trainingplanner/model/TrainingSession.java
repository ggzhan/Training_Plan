package com.example.trainingplanner.model;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public class TrainingSession {
    private List<Exercise> exercises;
    private int totalDuration;
    private int playerCount;
    private String notes;
    private Map<Exercise, List<PlayerPair>> exercisePairs;
    private Player unpairedPlayer;

    public TrainingSession() {
    }

    public List<Exercise> getExercises() {
        return exercises;
    }

    public void setExercises(List<Exercise> exercises) {
        this.exercises = exercises;
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

    public Map<Exercise, List<PlayerPair>> getExercisePairs() {
        return exercisePairs;
    }

    public void setExercisePairs(Map<Exercise, List<PlayerPair>> exercisePairs) {
        this.exercisePairs = exercisePairs;
    }

    public Player getUnpairedPlayer() {
        return unpairedPlayer;
    }

    public void setUnpairedPlayer(Player unpairedPlayer) {
        this.unpairedPlayer = unpairedPlayer;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        TrainingSession that = (TrainingSession) o;
        return totalDuration == that.totalDuration && playerCount == that.playerCount
                && Objects.equals(exercises, that.exercises) && Objects.equals(notes, that.notes)
                && Objects.equals(exercisePairs, that.exercisePairs)
                && Objects.equals(unpairedPlayer, that.unpairedPlayer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(exercises, totalDuration, playerCount, notes, exercisePairs, unpairedPlayer);
    }

    @Override
    public String toString() {
        return "TrainingSession{" + "exercises=" + exercises + ", totalDuration=" + totalDuration + ", playerCount="
                + playerCount + ", notes='" + notes + '\'' + ", exercisePairs=" + exercisePairs + ", unpairedPlayer="
                + unpairedPlayer + '}';
    }
}
