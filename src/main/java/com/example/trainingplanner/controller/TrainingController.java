package com.example.trainingplanner.controller;

import com.example.trainingplanner.dto.RegenerateRequest;
import com.example.trainingplanner.model.PlanSettings;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingPlan;
import com.example.trainingplanner.service.GoogleSheetsService;
import com.example.trainingplanner.service.PdfExportService;
import com.example.trainingplanner.service.TrainingPlanService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper = new ObjectMapper();

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

    @PostMapping("/generate-plan")
    public String generatePlan(@RequestParam("trainingDate") String trainingDate,
            @RequestParam(value = "numberOfExercises", defaultValue = "6") int numberOfExercises,
            @RequestParam(value = "balleimerCount", defaultValue = "0") int balleimerCount,
            @RequestParam(value = "playersPerBalleimer", defaultValue = "2") int playersPerBalleimer,
            @RequestParam(value = "sparringPartnersJson", required = false) String sparringPartnersJson,
            @RequestParam(value = "playersJson", required = false) String playersJson,
            Model model) {
        try {
            List<Player> players = playersJson != null && !playersJson.isEmpty()
                    ? objectMapper.readValue(playersJson, new TypeReference<List<Player>>() {
                    })
                    : googleSheetsService.readPlayersForDate(trainingDate);
            List<String> sparringPartners = sparringPartnersJson != null && !sparringPartnersJson.isEmpty()
                    ? objectMapper.readValue(sparringPartnersJson, new TypeReference<List<String>>() {
                    })
                    : List.of();

            PlanSettings settings = new PlanSettings(numberOfExercises, balleimerCount, playersPerBalleimer,
                    sparringPartners);
            TrainingPlan plan = trainingPlanService.generatePlan(players, settings, trainingDate);
            model.addAttribute("planJson", objectMapper.writeValueAsString(plan));
            return "plan";
        } catch (Exception e) {
            // Back to the entry page with the same date and the hand-edited player list
            model.addAttribute("error", e instanceof IllegalArgumentException
                    ? e.getMessage()
                    : "Fehler beim Erstellen des Plans: " + e.getMessage());
            model.addAttribute("trainingDates", googleSheetsService.getTrainingDates());
            model.addAttribute("defaultDate", trainingDate);
            model.addAttribute("playersJson", playersJson);
            return "index";
        }
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
