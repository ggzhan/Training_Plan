package com.example.trainingplanner.controller;

import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingSession;
import com.example.trainingplanner.service.CsvService;
import com.example.trainingplanner.service.TrainingPlanService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;
import java.util.stream.Collectors;

@Controller
public class TrainingController {

    private final TrainingPlanService trainingPlanService;
    private final CsvService csvService;

    public TrainingController(TrainingPlanService trainingPlanService, CsvService csvService) {
        this.trainingPlanService = trainingPlanService;
        this.csvService = csvService;
    }

    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("trainingDates", csvService.getTrainingDates());
        model.addAttribute("defaultDate", csvService.getNextTrainingDate());
        return "index";
    }

    @GetMapping("/api/players")
    @ResponseBody
    public List<Player> getPlayersForDate(@RequestParam("date") String date) {
        return csvService.readPlayersForDate(date);
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
                // Fallback to reading from CSV
                players = csvService.readPlayersForDate(trainingDate);
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
