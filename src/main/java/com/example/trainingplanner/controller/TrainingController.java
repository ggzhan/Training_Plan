package com.example.trainingplanner.controller;

import com.example.trainingplanner.dto.GenerateRequest;
import com.example.trainingplanner.dto.RegenerateRequest;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingPlan;
import com.example.trainingplanner.service.GoogleSheetsService;
import com.example.trainingplanner.service.PdfExportService;
import com.example.trainingplanner.service.TrainingPlanService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;
import java.util.Map;

@Controller
public class TrainingController {

    private final TrainingPlanService trainingPlanService;
    private final GoogleSheetsService googleSheetsService;
    private final PdfExportService pdfExportService;

    public TrainingController(TrainingPlanService trainingPlanService,
                              GoogleSheetsService googleSheetsService,
                              PdfExportService pdfExportService) {
        this.trainingPlanService = trainingPlanService;
        this.googleSheetsService = googleSheetsService;
        this.pdfExportService = pdfExportService;
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
                "lastRefresh", String.valueOf(googleSheetsService.getLastRefreshTime()));
    }

    @GetMapping("/plan")
    public String plan() {
        // The plan itself lives in the browser; plan.js reads it from storage
        return "plan";
    }

    @PostMapping("/api/generate-plan")
    @ResponseBody
    public TrainingPlan generatePlan(@RequestBody GenerateRequest request) {
        List<Player> players = request.getPlayers() != null && !request.getPlayers().isEmpty()
                ? request.getPlayers()
                : googleSheetsService.readPlayersForDate(request.getTrainingDate());
        return trainingPlanService.generatePlan(players, request.getSettings(), request.getTrainingDate());
    }

    @PostMapping("/api/regenerate-exercises")
    @ResponseBody
    public TrainingPlan regenerateExercises(@RequestBody RegenerateRequest request) {
        return trainingPlanService.regenerateFrom(request.getPlan(), request.getKeepThrough());
    }

    @PostMapping("/api/export-pdf")
    public ResponseEntity<byte[]> exportPdf(@RequestBody TrainingPlan plan) throws Exception {
        byte[] pdfBytes = pdfExportService.generatePdf(plan);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", "trainingsplan.pdf");
        headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");
        return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
