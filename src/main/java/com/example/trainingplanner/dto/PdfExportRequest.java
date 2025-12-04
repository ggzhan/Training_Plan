package com.example.trainingplanner.dto;

import com.example.trainingplanner.model.Player;

import java.util.List;
import java.util.Map;

/**
 * DTO for PDF export request containing training plan data.
 */
public class PdfExportRequest {
    private int playerCount;
    private List<ExerciseDto> exercises;
    private Map<String, List<PairDto>> exercisePairs;
    private Map<String, List<String>> unpairedPlayers;

    public int getPlayerCount() {
        return playerCount;
    }

    public void setPlayerCount(int playerCount) {
        this.playerCount = playerCount;
    }

    public List<ExerciseDto> getExercises() {
        return exercises;
    }

    public void setExercises(List<ExerciseDto> exercises) {
        this.exercises = exercises;
    }

    public Map<String, List<PairDto>> getExercisePairs() {
        return exercisePairs;
    }

    public void setExercisePairs(Map<String, List<PairDto>> exercisePairs) {
        this.exercisePairs = exercisePairs;
    }

    public Map<String, List<String>> getUnpairedPlayers() {
        return unpairedPlayers;
    }

    public void setUnpairedPlayers(Map<String, List<String>> unpairedPlayers) {
        this.unpairedPlayers = unpairedPlayers;
    }

    public static class ExerciseDto {
        private String name;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }

    public static class PairDto {
        private String player1Name;
        private int player1Klassierung;
        private String player2Name;
        private int player2Klassierung;

        public String getPlayer1Name() {
            return player1Name;
        }

        public void setPlayer1Name(String player1Name) {
            this.player1Name = player1Name;
        }

        public int getPlayer1Klassierung() {
            return player1Klassierung;
        }

        public void setPlayer1Klassierung(int player1Klassierung) {
            this.player1Klassierung = player1Klassierung;
        }

        public String getPlayer2Name() {
            return player2Name;
        }

        public void setPlayer2Name(String player2Name) {
            this.player2Name = player2Name;
        }

        public int getPlayer2Klassierung() {
            return player2Klassierung;
        }

        public void setPlayer2Klassierung(int player2Klassierung) {
            this.player2Klassierung = player2Klassierung;
        }
    }
}
