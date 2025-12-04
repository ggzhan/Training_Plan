package com.example.trainingplanner.controller;

import com.example.trainingplanner.dto.PdfExportRequest;
import com.example.trainingplanner.dto.RegenerateRequest;
import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.TrainingSession;
import com.example.trainingplanner.service.GoogleSheetsService;
import com.example.trainingplanner.service.PdfExportService;
import com.example.trainingplanner.service.TrainingPlanService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.ArrayList;
import java.util.HashMap;
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
                "lastRefresh", googleSheetsService.getLastRefreshTime().toString());
    }

    @PostMapping("/generate-plan")
    public String generatePlan(@RequestParam("trainingDate") String trainingDate,
            @RequestParam(value = "numberOfExercises", defaultValue = "6") int numberOfExercises,
            @RequestParam(value = "unpairedPlayersCount", defaultValue = "1") int unpairedPlayersCount,
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
            TrainingSession session = trainingPlanService.generatePlan(players, numberOfExercises,
                    unpairedPlayersCount);
            model.addAttribute("trainingPlan", session);
            return "plan";
        } catch (Exception e) {

            model.addAttribute("error", "Error generating plan: " + e.getMessage());
            return "index";
        }
    }

    @PostMapping("/api/regenerate-exercises")
    @ResponseBody
    public com.example.trainingplanner.dto.RegenerateResponse regenerateExercises(
            @RequestBody RegenerateRequest request) {
        return trainingPlanService.regenerateRemainingExercises(request);
    }

    @PostMapping("/api/export-pdf")
    public ResponseEntity<byte[]> exportPdf(@RequestBody PdfExportRequest request) {
        try {
            // Convert DTO to model objects for PDF service
            List<Exercise> exercises = new ArrayList<>();
            for (PdfExportRequest.ExerciseDto dto : request.getExercises()) {
                exercises.add(new Exercise(dto.getName(), "", "Generic", 0));
            }

            // Convert pairs
            Map<String, List<PlayerPair>> exercisePairs = new HashMap<>();
            for (Map.Entry<String, List<PdfExportRequest.PairDto>> entry : request.getExercisePairs().entrySet()) {
                List<PlayerPair> pairs = new ArrayList<>();
                for (PdfExportRequest.PairDto pairDto : entry.getValue()) {
                    Player p1 = new Player(pairDto.getPlayer1Name(), pairDto.getPlayer1Klassierung());
                    Player p2 = new Player(pairDto.getPlayer2Name(), pairDto.getPlayer2Klassierung());
                    pairs.add(new PlayerPair(p1, p2));
                }
                exercisePairs.put(entry.getKey(), pairs);
            }

            // Convert unpaired players
            Map<String, List<Player>> unpairedPlayers = new HashMap<>();
            if (request.getUnpairedPlayers() != null) {
                for (Map.Entry<String, List<String>> entry : request.getUnpairedPlayers().entrySet()) {
                    List<Player> players = new ArrayList<>();
                    for (String name : entry.getValue()) {
                        players.add(new Player(name, 0));
                    }
                    unpairedPlayers.put(entry.getKey(), players);
                }
            }

            byte[] pdfBytes = pdfExportService.generatePdf(
                    request.getPlayerCount(),
                    exercises,
                    exercisePairs,
                    unpairedPlayers
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "trainingsplan.pdf");
            headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");

            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
