package com.example.trainingplanner.controller;

import com.example.trainingplanner.model.TrainingSession;
import com.example.trainingplanner.service.CsvService;
import com.example.trainingplanner.service.TrainingPlanService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

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
    public String generatePlan(
            @RequestParam("totalTime") int totalTime,
            @RequestParam("trainingDate") String trainingDate,
            Model model) {
        try {
            TrainingSession trainingPlan = trainingPlanService.generatePlan(totalTime, trainingDate);
            System.out.println("Generated Plan: " + trainingPlan);
            model.addAttribute("trainingPlan", trainingPlan);
            return "plan";
        } catch (Exception e) {
            model.addAttribute("error", e.getMessage());
            return "index";
        }
    }
}
