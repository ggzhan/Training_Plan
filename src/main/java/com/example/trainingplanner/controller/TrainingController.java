package com.example.trainingplanner.controller;

import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingSession;
import com.example.trainingplanner.service.GoogleSheetsService;
import com.example.trainingplanner.service.TrainingPlanService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;
import java.util.Map;

@Controller
public class TrainingController {

    private final TrainingPlanService trainingPlanService;
    private final GoogleSheetsService googleSheetsService;

    public TrainingController(TrainingPlanService trainingPlanService, GoogleSheetsService googleSheetsService) {
        this.trainingPlanService = trainingPlanService;
        this.googleSheetsService = googleSheetsService;
    }

    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("trainingDates", googleSheetsService.getTrainingDates());
        model.addAttribute("defaultDate", googleSheetsService.getNextTrainingDate());
        return "index";
    }

    @GetMapping("/api/players")
    @ResponseBody
    public List<Player> getPlayersForDate(@RequestParam("date") String date) {
        return googleSheetsService.readPlayersForDate(date);
    }

    @PostMapping("/api/refresh")
    @ResponseBody
    public Map<String, String> refreshData() {
        googleSheetsService.refreshData();
        return Map.of(
                "status", "success",
                "message", "Data refreshed successfully",
                "lastRefresh", googleSheetsService.getLastRefreshTime().toString());
    }

    @PostMapping("/generate-plan")
    public String generatePlan(@RequestParam("trainingDate") String trainingDate,
            @RequestParam(value = "numberOfExercises", defaultValue = "6") int numberOfExercises,
            @RequestParam(value = "playersJson", required = false) String playersJson,
            Model model) {
        try {
            List<Player> players;
            if (playersJson != null && !playersJson.isEmpty()) {
                // Parse JSON from frontend
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                players = mapper.readValue(playersJson,
                        new com.fasterxml.jackson.core.type.TypeReference<List<Player>>() {
                        });
            } else {
                // Fallback to reading from Google Sheets
                players = googleSheetsService.readPlayersForDate(trainingDate);
            }

            // Pass players to the service
            TrainingSession session = trainingPlanService.generatePlan(players, numberOfExercises);
            model.addAttribute("trainingPlan", session);
            return "plan";
        } catch (Exception e) {
            e.printStackTrace();
            model.addAttribute("error", "Error generating plan: " + e.getMessage());
            return "index";
        }
    }
}
