package com.example.trainingplanner.dto;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class RegenerateResponse {
    private List<ExerciseDto> exercises;
    private Map<String, List<PlayerPair>> exercisePairs;
    private Map<String, Player> unpairedPlayers;

    public RegenerateResponse() {
    }

    public List<ExerciseDto> getExercises() {
        return exercises;
    }

    public void setExercises(List<ExerciseDto> exercises) {
        this.exercises = exercises;
    }

    public Map<String, List<PlayerPair>> getExercisePairs() {
        return exercisePairs;
    }

    public void setExercisePairs(Map<String, List<PlayerPair>> exercisePairs) {
        this.exercisePairs = exercisePairs;
    }

    public Map<String, Player> getUnpairedPlayers() {
        return unpairedPlayers;
    }

    public void setUnpairedPlayers(Map<String, Player> unpairedPlayers) {
        this.unpairedPlayers = unpairedPlayers;
    }

    public static class ExerciseDto {
        private String name;

        public ExerciseDto() {
        }

        public ExerciseDto(String name) {
            this.name = name;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }
}
