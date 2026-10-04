package com.example.trainingplanner.service;

import com.example.trainingplanner.model.ExerciseRound;
import com.example.trainingplanner.model.PlanSettings;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.SparringAssignment;
import com.example.trainingplanner.model.TrainingPlan;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class TrainingPlanServiceTest {

    private static final int[] LEVELS = { 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 10, 12 };

    private static List<Player> kids(int n) {
        List<Player> players = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            players.add(new Player("Kind " + i, LEVELS[i % LEVELS.length]));
        }
        return players;
    }

    private static PlanSettings settings(int exercises, int balleimer, int perBalleimer, String... partners) {
        return new PlanSettings(exercises, new ArrayList<>(java.util.Collections.nCopies(balleimer, perBalleimer)),
                new ArrayList<>(List.of(partners)));
    }

    private static TrainingPlan generate(long seed, List<Player> players, PlanSettings settings) {
        return new TrainingPlanService(new Random(seed)).generatePlan(players, settings, "3. Oktober");
    }

    private static List<String> namesIn(ExerciseRound round) {
        List<String> names = new ArrayList<>();
        round.getPairs().forEach(p -> {
            names.add(p.getPlayer1().getName());
            names.add(p.getPlayer2().getName());
        });
        round.getBalleimer().forEach(b -> b.forEach(p -> names.add(p.getName())));
        round.getSparring().forEach(s -> names.add(s.getPlayer().getName()));
        round.getUnpaired().forEach(p -> names.add(p.getName()));
        round.getMentalTrainer().forEach(p -> names.add(p.getName()));
        return names;
    }

    private static String pairKey(PlayerPair pair) {
        String a = pair.getPlayer1().getName();
        String b = pair.getPlayer2().getName();
        return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
    }

    @Test
    void everyKidHasExactlyOnePlacePerExercise() {
        List<Player> players = kids(20);
        for (long seed = 0; seed < 20; seed++) {
            TrainingPlan plan = generate(seed, players, settings(5, 2, 2, "Trainer A", "Trainer B"));
            assertEquals(5, plan.getExercises().size());
            for (ExerciseRound round : plan.getExercises()) {
                List<String> names = namesIn(round);
                assertEquals(20, names.size());
                assertEquals(20, new HashSet<>(names).size(), "a kid has two places: " + names);
                assertEquals(2, round.getBalleimer().size());
                round.getBalleimer().forEach(b -> assertEquals(2, b.size()));
                assertEquals(List.of("Trainer A", "Trainer B"),
                        round.getSparring().stream().map(SparringAssignment::getPartner).toList());
                assertEquals(7, round.getPairs().size());
                assertTrue(round.getUnpaired().isEmpty());
            }
        }
    }

    @Test
    void kidGoesToABalleimerAtMostOncePerSession() {
        List<Player> players = kids(20);
        for (long seed = 0; seed < 20; seed++) {
            // 5 exercises × 2 Balleimer × 2 kids = all 20 kids exactly once
            TrainingPlan plan = generate(seed, players, settings(5, 2, 2));
            Set<String> seen = new HashSet<>();
            for (ExerciseRound round : plan.getExercises()) {
                round.getBalleimer().forEach(b -> b.forEach(p -> assertTrue(seen.add(p.getName()),
                        p.getName() + " is at a Balleimer twice")));
            }
            assertEquals(20, seen.size());
            assertTrue(plan.getWarnings().isEmpty(), plan.getWarnings().toString());
        }
    }

    @Test
    void sparringPartnerNeverGetsTheSameKidTwice() {
        List<Player> players = kids(12);
        for (long seed = 0; seed < 20; seed++) {
            TrainingPlan plan = generate(seed, players, settings(6, 1, 2, "Trainer A", "Trainer B", "Trainer C"));
            Set<String> seen = new HashSet<>();
            for (ExerciseRound round : plan.getExercises()) {
                for (SparringAssignment s : round.getSparring()) {
                    assertTrue(seen.add(s.getPartner() + "|" + s.getPlayer().getName()),
                            s.getPartner() + " has " + s.getPlayer().getName() + " twice");
                }
            }
        }
    }

    @Test
    void pairsDoNotRepeatAndTheOddKidOutRotates() {
        List<Player> players = kids(9);
        for (long seed = 0; seed < 20; seed++) {
            TrainingPlan plan = generate(seed, players, settings(6, 0, 2));
            Set<String> pairs = new HashSet<>();
            Set<String> sitOuts = new HashSet<>();
            for (ExerciseRound round : plan.getExercises()) {
                round.getPairs().forEach(p -> assertTrue(pairs.add(pairKey(p)), pairKey(p) + " repeats"));
                assertEquals(1, round.getUnpaired().size());
                assertTrue(sitOuts.add(round.getUnpaired().get(0).getName()), "same kid sits out twice");
            }
            assertTrue(plan.getWarnings().isEmpty(), plan.getWarnings().toString());
        }
    }

    @Test
    void firstExercisePairsKidsOfTheSameLevel() {
        List<Player> players = List.of(new Player("A", 1), new Player("B", 12), new Player("C", 1),
                new Player("D", 12), new Player("E", 6), new Player("F", 6));
        TrainingPlan plan = generate(1, new ArrayList<>(players), settings(1, 0, 2));
        for (PlayerPair pair : plan.getExercises().get(0).getPairs()) {
            assertEquals(pair.getPlayer1().getKlassierung(), pair.getPlayer2().getKlassierung());
        }
    }

    @Test
    void largeGroupsGenerateQuickly() {
        // 20 kids with three off used to run for minutes
        TrainingPlan plan = assertTimeoutPreemptively(Duration.ofSeconds(5),
                () -> generate(7, kids(20), settings(6, 1, 2, "Trainer A")));
        assertTrue(plan.getWarnings().isEmpty(), plan.getWarnings().toString());
        TrainingPlan big = assertTimeoutPreemptively(Duration.ofSeconds(5),
                () -> generate(7, kids(27), settings(10, 0, 2)));
        assertTrue(big.getWarnings().isEmpty(), big.getWarnings().toString());
    }

    @Test
    void moreExercisesThanTheGroupAllowsStillGivesAPlanWithWarnings() {
        // 4 kids can only form 3 distinct rounds of pairs
        TrainingPlan plan = generate(3, kids(4), settings(5, 0, 2));
        assertEquals(5, plan.getExercises().size());
        assertFalse(plan.getWarnings().isEmpty());
    }

    @Test
    void moreBalleimerPlacesThanKidsSpreadsRepeatsAndWarns() {
        // 6 exercises × 2 places = 12 places for 10 kids: 2 kids go twice, nobody three times
        TrainingPlan plan = generate(0, kids(10), settings(6, 1, 2));
        java.util.Map<String, Integer> visits = new java.util.HashMap<>();
        plan.getExercises().forEach(round ->
                round.getBalleimer().forEach(b -> b.forEach(p -> visits.merge(p.getName(), 1, Integer::sum))));
        assertEquals(10, visits.size());
        assertEquals(2, visits.values().stream().filter(v -> v == 2).count());
        assertTrue(visits.values().stream().allMatch(v -> v <= 2));
        assertTrue(plan.getWarnings().stream().anyMatch(w -> w.contains("zum zweiten Mal am Balleimer")));
    }

    @Test
    void moreStationPlacesThanKidsIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> generate(0, kids(4), settings(1, 2, 2, "Trainer A")));
    }

    @Test
    void sparringPartnerWhoIsAlsoAPlayerIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> generate(0, kids(6), settings(2, 0, 2, "Kind 0")));
    }

    @Test
    void regenerateKeepsEarlierExercisesAndRespectsWhatTheyUsed() {
        List<Player> players = kids(16);
        TrainingPlanService service = new TrainingPlanService(new Random(5));
        TrainingPlan plan = service.generatePlan(players, settings(6, 1, 2, "Trainer A"), "3. Oktober");

        TrainingPlan regenerated = service.regenerateFrom(plan, 1);

        assertEquals(6, regenerated.getExercises().size());
        assertSame(plan.getExercises().get(0), regenerated.getExercises().get(0));
        assertSame(plan.getExercises().get(1), regenerated.getExercises().get(1));
        Set<String> balleimer = new HashSet<>();
        Set<String> pairs = new HashSet<>();
        for (ExerciseRound round : regenerated.getExercises()) {
            round.getBalleimer().forEach(b -> b.forEach(p -> assertTrue(balleimer.add(p.getName()))));
            round.getPairs().forEach(p -> assertTrue(pairs.add(pairKey(p)), pairKey(p) + " repeats"));
        }
    }

    @Test
    void regenerateWithChangedAttendancePlansOnlyTheKidsWhoAreThere() {
        List<Player> players = kids(12);
        TrainingPlanService service = new TrainingPlanService(new Random(9));
        TrainingPlan plan = service.generatePlan(players, settings(5, 1, 2, "Trainer A"), "3. Oktober");

        // Kind 0 went home after Übung 2, a late kid arrived
        List<Player> present = new ArrayList<>(players.subList(1, players.size()));
        present.add(new Player("Spät", 4));
        plan.setPlayers(present);
        TrainingPlan adjusted = service.regenerateFrom(plan, 1);

        assertEquals(5, adjusted.getExercises().size());
        for (int e = 2; e < 5; e++) {
            List<String> names = namesIn(adjusted.getExercises().get(e));
            assertFalse(names.contains("Kind 0"), "absent kid still planned in exercise " + (e + 1));
            assertTrue(names.contains("Spät"), "late kid missing in exercise " + (e + 1));
            assertEquals(12, names.size());
        }
        assertTrue(namesIn(adjusted.getExercises().get(0)).contains("Kind 0"));
    }

    @Test
    void eachBalleimerGetsItsOwnNumberOfKids() {
        List<Player> players = kids(15);
        PlanSettings uneven = new PlanSettings(3, new ArrayList<>(List.of(3, 1)), new ArrayList<>());
        for (long seed = 0; seed < 10; seed++) {
            TrainingPlan plan = generate(seed, players, uneven);
            Set<String> seen = new HashSet<>();
            for (ExerciseRound round : plan.getExercises()) {
                assertEquals(List.of(3, 1), round.getBalleimer().stream().map(List::size).toList());
                round.getBalleimer().forEach(b -> b.forEach(p -> assertTrue(seen.add(p.getName()))));
                assertEquals(15, new HashSet<>(namesIn(round)).size());
            }
        }
    }

    @Test
    void oldSavedPlansWithOneSizeForAllBalleimerStillWork() {
        PlanSettings legacy = new PlanSettings();
        legacy.setNumberOfExercises(2);
        legacy.setBalleimerCount(2);
        legacy.setPlayersPerBalleimer(3);
        legacy.setSparringPartners(new ArrayList<>());

        TrainingPlan plan = generate(1, kids(14), legacy);

        assertEquals(List.of(3, 3), plan.getSettings().getBalleimerSizes());
        plan.getExercises().forEach(round ->
                assertEquals(List.of(3, 3), round.getBalleimer().stream().map(List::size).toList()));
    }

    private static List<Player> rankedKids(int n) {
        // Kind 0 is strongest (Klassierung n), Kind n-1 weakest (1)
        List<Player> players = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            players.add(new Player("Kind " + i, n - i));
        }
        return players;
    }

    private static List<String> mentalNames(ExerciseRound round) {
        return round.getMentalTrainer().stream().map(Player::getName).sorted().toList();
    }

    @Test
    void mentalTrainerTakesTheStrongestKidsForWholeSessions() {
        PlanSettings s = new PlanSettings(5, new ArrayList<>(List.of(2)), new ArrayList<>(List.of("Trainer A")), 3, 2);
        for (long seed = 0; seed < 10; seed++) {
            TrainingPlan plan = generate(seed, rankedKids(14), s);
            List<ExerciseRound> ex = plan.getExercises();
            assertEquals(List.of("Kind 0", "Kind 1", "Kind 2"), mentalNames(ex.get(0)));
            assertEquals(mentalNames(ex.get(0)), mentalNames(ex.get(1)));
            assertEquals(List.of("Kind 3", "Kind 4", "Kind 5"), mentalNames(ex.get(2)));
            assertEquals(mentalNames(ex.get(2)), mentalNames(ex.get(3)));
            // Session 3 is only Übung 5, still the next strongest
            assertEquals(List.of("Kind 6", "Kind 7", "Kind 8"), mentalNames(ex.get(4)));
            for (ExerciseRound round : ex) {
                List<String> names = namesIn(round);
                assertEquals(14, names.size());
                assertEquals(14, new HashSet<>(names).size(), "a kid has two places: " + names);
            }
            assertTrue(plan.getWarnings().isEmpty(), plan.getWarnings().toString());
        }
    }

    @Test
    void mentalTrainerRepeatsStrongestFirstOnlyWhenEveryoneHasBeen() {
        // 4 sessions × 2 kids = 8 places for 6 kids
        PlanSettings s = new PlanSettings(4, new ArrayList<>(), new ArrayList<>(), 2, 1);
        TrainingPlan plan = generate(2, rankedKids(6), s);
        assertEquals(List.of("Kind 0", "Kind 1"), mentalNames(plan.getExercises().get(3)));
        assertTrue(plan.getWarnings().stream().anyMatch(w -> w.contains("zum zweiten Mal beim Mentaltrainer")));
    }

    @Test
    void replanningMidSessionKeepsTheMentalTrainerGroup() {
        TrainingPlanService service = new TrainingPlanService(new Random(4));
        PlanSettings s = new PlanSettings(4, new ArrayList<>(), new ArrayList<>(), 2, 2);
        TrainingPlan plan = service.generatePlan(rankedKids(10), s, "3. Oktober");

        // Kind 1 (in the first session) goes home after Übung 1
        List<Player> present = new ArrayList<>(plan.getPlayers());
        present.removeIf(p -> p.getName().equals("Kind 1"));
        plan.setPlayers(present);
        TrainingPlan adjusted = service.regenerateFrom(plan, 0);

        // Kind 0 stays for Übung 2; the open place goes to the strongest kid not yet there
        assertEquals(List.of("Kind 0", "Kind 2"), mentalNames(adjusted.getExercises().get(1)));
        assertEquals(List.of("Kind 3", "Kind 4"), mentalNames(adjusted.getExercises().get(2)));
    }
}
