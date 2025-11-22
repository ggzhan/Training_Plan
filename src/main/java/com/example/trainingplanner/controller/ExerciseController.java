package com.example.trainingplanner.controller;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.service.CsvService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;

@Controller
public class ExerciseController {

    private final CsvService csvService;

    public ExerciseController(CsvService csvService) {
        this.csvService = csvService;
    }

    @GetMapping("/exercises")
    public String listExercises(Model model) {
        model.addAttribute("exercises", csvService.readExercises());
        model.addAttribute("newExercise", new Exercise());
        return "exercises";
    }

    @PostMapping("/exercises")
    public String addExercise(@ModelAttribute Exercise exercise) {
        csvService.saveExercise(exercise);
        return "redirect:/exercises";
    }
}
