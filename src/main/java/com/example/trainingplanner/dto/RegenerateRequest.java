package com.example.trainingplanner.dto;

import com.example.trainingplanner.model.Player;
import java.util.List;
import java.util.Map;

public class RegenerateRequest {
    private int exerciseIndex;
    private Map<String, List<PairDto>> currentPairings;
    private Map<String, String> unpairedPlayers;
    private List<Player> availablePlayers;

    public static class PairDto {
        private String player1Name;
        private String player2Name;

        public PairDto() {
        }

        public PairDto(String player1Name, String player2Name) {
            this.player1Name = player1Name;
            this.player2Name = player2Name;
        }

        public String getPlayer1Name() {
            return player1Name;
        }

        public void setPlayer1Name(String player1Name) {
            this.player1Name = player1Name;
        }

        public String getPlayer2Name() {
            return player2Name;
        }

        public void setPlayer2Name(String player2Name) {
            this.player2Name = player2Name;
        }
    }

    public RegenerateRequest() {
    }

    public int getExerciseIndex() {
        return exerciseIndex;
    }

    public void setExerciseIndex(int exerciseIndex) {
        this.exerciseIndex = exerciseIndex;
    }

    public Map<String, List<PairDto>> getCurrentPairings() {
        return currentPairings;
    }

    public void setCurrentPairings(Map<String, List<PairDto>> currentPairings) {
        this.currentPairings = currentPairings;
    }

    public Map<String, String> getUnpairedPlayers() {
        return unpairedPlayers;
    }

    public void setUnpairedPlayers(Map<String, String> unpairedPlayers) {
        this.unpairedPlayers = unpairedPlayers;
    }

    public List<Player> getAvailablePlayers() {
        return availablePlayers;
    }

    public void setAvailablePlayers(List<Player> availablePlayers) {
        this.availablePlayers = availablePlayers;
    }
}
