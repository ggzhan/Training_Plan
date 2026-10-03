package com.example.trainingplanner.dto;

import com.example.trainingplanner.model.PlanSettings;
import com.example.trainingplanner.model.Player;

import java.util.ArrayList;
import java.util.List;

public class GenerateRequest {
    private String trainingDate;
    private List<Player> players = new ArrayList<>();
    private PlanSettings settings;

    public String getTrainingDate() {
        return trainingDate;
    }

    public void setTrainingDate(String trainingDate) {
        this.trainingDate = trainingDate;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public void setPlayers(List<Player> players) {
        this.players = players;
    }

    public PlanSettings getSettings() {
        return settings;
    }

    public void setSettings(PlanSettings settings) {
        this.settings = settings;
    }
}
