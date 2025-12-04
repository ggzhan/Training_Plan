package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;

@Service
public class PdfExportService {

    private static final Font TITLE_FONT = new Font(Font.HELVETICA, 14, Font.BOLD, new Color(102, 126, 234));
    private static final Font HEADER_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE);
    private static final Font PAIR_FONT = new Font(Font.HELVETICA, 9, Font.NORMAL, new Color(51, 51, 51));
    private static final Font UNPAIRED_FONT = new Font(Font.HELVETICA, 9, Font.BOLD, new Color(139, 69, 19)); // Dark brown for readability
    private static final Color PRIMARY_COLOR = new Color(102, 126, 234);
    private static final Color LIGHT_BG = new Color(248, 249, 252);
    private static final Color UNPAIRED_BG = new Color(255, 248, 225); // Light yellow
    private static final Color UNPAIRED_BORDER = new Color(200, 150, 50); // Muted orange border

    public byte[] generatePdf(int playerCount, List<Exercise> exercises,
                              Map<String, List<PlayerPair>> exercisePairs,
                              Map<String, List<Player>> unpairedPlayers) throws DocumentException {

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 25, 25, 25, 25); // Reduced margins
        PdfWriter.getInstance(document, outputStream);

        document.open();

        // Title with summary inline
        Paragraph title = new Paragraph();
        title.add(new Chunk("Trainingsplan", TITLE_FONT));
        title.add(new Chunk("  •  " + playerCount + " Spieler  •  " + exercises.size() + " Übungen", 
                new Font(Font.HELVETICA, 10, Font.NORMAL, new Color(100, 100, 100))));
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingAfter(8);
        document.add(title);

        // All exercises in a compact layout
        for (int i = 0; i < exercises.size(); i++) {
            Exercise exercise = exercises.get(i);
            String exerciseKey = exercise.getName();

            // Exercise header - compact
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

            // Pairs table - more columns for compact layout
            List<PlayerPair> pairs = exercisePairs.get(exerciseKey);
            if (pairs != null && !pairs.isEmpty()) {
                int cols = pairs.size() <= 2 ? 2 : 3; // Use 3 columns if more pairs
                PdfPTable pairsTable = new PdfPTable(cols);
                pairsTable.setWidthPercentage(100);

                for (PlayerPair pair : pairs) {
                    PdfPCell cell = new PdfPCell();
                    cell.setBackgroundColor(LIGHT_BG);
                    cell.setPadding(3);
                    cell.setBorderColor(new Color(220, 220, 220));
                    cell.setBorderWidth(0.5f);

                    Phrase pairPhrase = new Phrase(
                            pair.getPlayer1().getName() + " & " + pair.getPlayer2().getName(),
                            PAIR_FONT);
                    cell.addElement(pairPhrase);
                    pairsTable.addCell(cell);
                }

                // Fill remaining cells
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

            // Unpaired players - inline and more readable
            List<Player> unpaired = unpairedPlayers.get(exerciseKey);
            if (unpaired != null && !unpaired.isEmpty()) {
                PdfPTable unpairedTable = new PdfPTable(1);
                unpairedTable.setWidthPercentage(100);

                StringBuilder unpairedText = new StringBuilder("⚠ Ohne Partner: ");
                for (int j = 0; j < unpaired.size(); j++) {
                    unpairedText.append(unpaired.get(j).getName());
                    if (j < unpaired.size() - 1) {
                        unpairedText.append(", ");
                    }
                }

                PdfPCell unpairedCell = new PdfPCell(new Phrase(unpairedText.toString(), UNPAIRED_FONT));
                unpairedCell.setBackgroundColor(UNPAIRED_BG);
                unpairedCell.setPadding(3);
                unpairedCell.setBorderColor(UNPAIRED_BORDER);
                unpairedCell.setBorderWidth(0.5f);
                unpairedTable.addCell(unpairedCell);

                document.add(unpairedTable);
            }
        }

        document.close();
        return outputStream.toByteArray();
    }
}

