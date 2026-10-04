package com.example.trainingplanner.service;

import com.example.trainingplanner.model.ExerciseRound;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.SparringAssignment;
import com.example.trainingplanner.model.TrainingPlan;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class PdfExportService {

    private static final Font TITLE_FONT = new Font(Font.HELVETICA, 14, Font.BOLD, new Color(102, 126, 234));
    private static final Font SUBTITLE_FONT = new Font(Font.HELVETICA, 10, Font.NORMAL, new Color(100, 100, 100));
    private static final Font HEADER_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE);
    private static final Font PAIR_FONT = new Font(Font.HELVETICA, 9, Font.NORMAL, new Color(51, 51, 51));
    private static final Font LABEL_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, new Color(51, 51, 51));
    private static final Font UNPAIRED_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, new Color(139, 69, 19)); // Dark brown for readability
    private static final Color PRIMARY_COLOR = new Color(102, 126, 234);
    private static final Color LIGHT_BG = new Color(248, 249, 252);
    private static final Color BALLEIMER_BG = new Color(232, 245, 233); // Light green
    private static final Color SPARRING_BG = new Color(232, 240, 254); // Light blue
    private static final Color MENTAL_BG = new Color(230, 244, 247); // Light teal
    private static final Color UNPAIRED_BG = new Color(255, 248, 225); // Light yellow
    private static final Color BORDER = new Color(220, 220, 220);

    public byte[] generatePdf(TrainingPlan plan) throws DocumentException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 25, 25, 25, 25); // Reduced margins
        PdfWriter.getInstance(document, outputStream);

        document.open();

        // Title with summary inline
        Paragraph title = new Paragraph();
        title.add(new Chunk("Trainingsplan", TITLE_FONT));
        String date = plan.getTrainingDate() != null && !plan.getTrainingDate().isBlank()
                ? "  •  " + plan.getTrainingDate()
                : "";
        title.add(new Chunk(date + "  •  " + plan.getPlayers().size() + " Spieler  •  "
                + plan.getExercises().size() + " Übungen", SUBTITLE_FONT));
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingAfter(8);
        document.add(title);

        List<ExerciseRound> exercises = plan.getExercises();
        for (int i = 0; i < exercises.size(); i++) {
            ExerciseRound exercise = exercises.get(i);

            PdfPTable exerciseTable = new PdfPTable(1);
            exerciseTable.setWidthPercentage(100);
            exerciseTable.setSpacingBefore(i == 0 ? 0 : 6);
            PdfPCell headerCell = new PdfPCell(new Phrase("Übung " + (i + 1), HEADER_FONT));
            headerCell.setBackgroundColor(PRIMARY_COLOR);
            headerCell.setPadding(4);
            headerCell.setPaddingLeft(6);
            headerCell.setBorderWidth(0);
            exerciseTable.addCell(headerCell);
            document.add(exerciseTable);

            List<PlayerPair> pairs = exercise.getPairs();
            if (pairs != null && !pairs.isEmpty()) {
                int cols = pairs.size() <= 2 ? 2 : 3;
                PdfPTable pairsTable = new PdfPTable(cols);
                pairsTable.setWidthPercentage(100);
                for (PlayerPair pair : pairs) {
                    pairsTable.addCell(cell(new Phrase(
                            pair.getPlayer1().getName() + " & " + pair.getPlayer2().getName(), PAIR_FONT), LIGHT_BG));
                }
                int remaining = cols - (pairs.size() % cols);
                if (remaining < cols) {
                    for (int j = 0; j < remaining; j++) {
                        PdfPCell emptyCell = new PdfPCell(new Phrase(""));
                        emptyCell.setBorderWidth(0);
                        pairsTable.addCell(emptyCell);
                    }
                }
                document.add(pairsTable);
            }

            List<Player> mental = exercise.getMentalTrainer();
            if (mental != null && !mental.isEmpty()) {
                Phrase phrase = new Phrase();
                phrase.add(new Chunk("Mentaltrainer: ", LABEL_FONT));
                phrase.add(new Chunk(names(mental), PAIR_FONT));
                document.add(row(phrase, MENTAL_BG));
            }

            List<List<Player>> balleimer = exercise.getBalleimer();
            if (balleimer != null && !balleimer.isEmpty()) {
                Phrase phrase = new Phrase();
                for (int b = 0; b < balleimer.size(); b++) {
                    phrase.add(new Chunk((b == 0 ? "" : "     ") + "Balleimer " + (b + 1) + ": ", LABEL_FONT));
                    phrase.add(new Chunk(names(balleimer.get(b)), PAIR_FONT));
                }
                document.add(row(phrase, BALLEIMER_BG));
            }

            List<SparringAssignment> sparring = exercise.getSparring();
            if (sparring != null && !sparring.isEmpty()) {
                Phrase phrase = new Phrase();
                phrase.add(new Chunk("Sparring: ", LABEL_FONT));
                phrase.add(new Chunk(sparring.stream()
                        .map(s -> s.getPartner() + " – " + s.getPlayer().getName())
                        .collect(Collectors.joining(",  ")), PAIR_FONT));
                document.add(row(phrase, SPARRING_BG));
            }

            List<Player> unpaired = exercise.getUnpaired();
            if (unpaired != null && !unpaired.isEmpty()) {
                document.add(row(new Phrase("Ohne Partner: " + names(unpaired), UNPAIRED_FONT), UNPAIRED_BG));
            }
        }

        document.close();
        return outputStream.toByteArray();
    }

    private static String names(List<Player> players) {
        return players.stream().map(Player::getName).collect(Collectors.joining(", "));
    }

    private static PdfPCell cell(Phrase phrase, Color background) {
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(background);
        cell.setPadding(3);
        cell.setBorderColor(BORDER);
        cell.setBorderWidth(0.5f);
        cell.addElement(phrase);
        return cell;
    }

    private static PdfPTable row(Phrase phrase, Color background) {
        PdfPTable table = new PdfPTable(1);
        table.setWidthPercentage(100);
        table.addCell(cell(phrase, background));
        return table;
    }
}
