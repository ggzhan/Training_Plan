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

    @PostMapping("/generate-plan")
    public String generatePlan(@RequestParam("trainingDate") String trainingDate,
            @RequestParam(value = "numberOfExercises", defaultValue = "6") int numberOfExercises,
            Model model) {
        try {
            // Pass numberOfExercises to the service
            TrainingSession session = trainingPlanService.generatePlan(0, trainingDate, null, numberOfExercises);
            model.addAttribute("trainingPlan", session);
            return "plan";
        } catch (Exception e) {
            e.printStackTrace();
            model.addAttribute("error", "Error generating plan: " + e.getMessage());
            return "index";
        }
    }
}
