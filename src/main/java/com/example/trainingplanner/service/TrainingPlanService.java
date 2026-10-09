package com.example.trainingplanner.service;

import com.example.trainingplanner.model.ExerciseRound;
import com.example.trainingplanner.model.PlanSettings;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.SparringAssignment;
import com.example.trainingplanner.model.TrainingPlan;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Builds a training plan exercise by exercise. Within each exercise every kid gets
 * exactly one place: the Mentaltrainer, a Balleimer, a sparring partner, a pair,
 * or (when the rest is odd) no partner.
 *
 * The Mentaltrainer works in sessions of one or more consecutive exercises; the
 * same kids stay for the whole session. Kids picked by hand go first, in the
 * order picked; open places go to the strongest kids (highest Elo) who
 * have not been yet.
 *
 * Rules, strongest first:
 * - a kid goes to a Balleimer at most once per session (more only when there are
 *   more Balleimer places than kids, fewest visits first);
 * - a kid meets each sparring partner at most once;
 * - two kids play each other at most once, and nobody is without a partner twice;
 * - pairs are as close in Elo as possible.
 * When a rule cannot hold (more exercises than the group allows), the plan still
 * comes out and the bent rule is listed in {@link TrainingPlan#getWarnings()}.
 */
@Service
public class TrainingPlanService {

    // Weighs one repeated pair or second sit-out above the Elo gaps of a whole
    // round (30 kids, gaps up to a few thousand), so a repeat is always the worse choice
    private static final int REPEAT_PENALTY = 1_000_000;
    // Caps the pairing search so a large group answers in well under a second
    private static final long SEARCH_NODE_BUDGET = 300_000;

    private final Random random;

    public TrainingPlanService() {
        this(new Random());
    }

    TrainingPlanService(Random random) {
        this.random = random;
    }

    public TrainingPlan generatePlan(List<Player> players, PlanSettings settings, String trainingDate) {
        PlanSettings clean = normalize(settings);
        validate(players, clean);
        // More Balleimer places than kids is allowed: kids with the fewest visits go
        // first, and every second visit is listed in the warnings
        return build(players, clean, trainingDate, List.of());
    }

    /** Keeps exercises 0..keepThrough (possibly edited by hand) and generates the rest. */
    public TrainingPlan regenerateFrom(TrainingPlan plan, int keepThrough) {
        PlanSettings clean = normalize(plan.getSettings());
        validate(plan.getPlayers(), clean);
        int keep = Math.max(0, Math.min(keepThrough + 1, plan.getExercises().size()));
        List<ExerciseRound> kept = new ArrayList<>(plan.getExercises().subList(0, keep));
        return build(plan.getPlayers(), clean, plan.getTrainingDate(), kept);
    }

    private TrainingPlan build(List<Player> players, PlanSettings settings, String trainingDate,
            List<ExerciseRound> kept) {
        History history = new History();
        kept.forEach(history::record);

        List<String> warnings = new ArrayList<>();
        List<List<Player>> mentalSessions = scheduleMentalTrainer(players, settings, kept, warnings);
        List<ExerciseRound> exercises = new ArrayList<>(kept);
        for (int e = kept.size(); e < settings.getNumberOfExercises(); e++) {
            List<Player> mental = mentalSessions.isEmpty()
                    ? List.of()
                    : mentalSessions.get(e / settings.getMentalTrainerLength());
            ExerciseRound round = nextRound(players, settings, history, warnings, e + 1, mental);
            history.record(round);
            exercises.add(round);
        }

        TrainingPlan plan = new TrainingPlan();
        plan.setTrainingDate(trainingDate);
        plan.setSettings(settings);
        plan.setPlayers(players);
        plan.setExercises(exercises);
        plan.setWarnings(warnings);
        return plan;
    }

    /**
     * Picks the Mentaltrainer group for every session up front, since a group stays
     * for several exercises. A session that already started in a kept exercise
     * continues with the kids still present there; open places go first to the
     * hand-picked kids in order, then to the strongest kids with the fewest sessions.
     */
    private List<List<Player>> scheduleMentalTrainer(List<Player> players, PlanSettings settings,
            List<ExerciseRound> kept, List<String> warnings) {
        int size = settings.getMentalTrainerKids();
        int length = settings.getMentalTrainerLength();
        if (size == 0) {
            return List.of();
        }
        int sessions = (settings.getNumberOfExercises() + length - 1) / length;
        Set<String> present = new HashSet<>();
        players.forEach(p -> present.add(p.getName()));

        // Sessions each kid already had, and the group of a session cut by keepThrough
        Map<String, Integer> visits = new HashMap<>();
        Map<Integer, List<Player>> started = new HashMap<>();
        Map<Integer, Set<String>> keptSessionKids = new HashMap<>();
        for (int e = 0; e < kept.size(); e++) {
            int session = e / length;
            List<Player> group = kept.get(e).getMentalTrainer() == null ? List.of() : kept.get(e).getMentalTrainer();
            Set<String> names = keptSessionKids.computeIfAbsent(session, k -> new HashSet<>());
            group.forEach(p -> names.add(p.getName()));
            started.put(session, group);
        }
        keptSessionKids.values().forEach(names -> names.forEach(n -> visits.merge(n, 1, Integer::sum)));

        // Picks still present who have not had a session, in the order picked
        List<Player> picks = new ArrayList<>();
        for (String name : settings.getMentalTrainerPicks()) {
            if (present.contains(name) && visits.getOrDefault(name, 0) == 0
                    && picks.stream().noneMatch(p -> p.getName().equals(name))) {
                picks.add(findByName(players, name));
            }
        }

        List<List<Player>> schedule = new ArrayList<>();
        for (int session = 0; session < sessions; session++) {
            List<Player> group = new ArrayList<>();
            if (started.containsKey(session)) {
                for (Player p : started.get(session)) {
                    if (present.contains(p.getName())) {
                        group.add(findByName(players, p.getName()));
                    }
                }
            }
            while (group.size() < size && !picks.isEmpty()) {
                Player p = picks.remove(0);
                if (group.stream().noneMatch(g -> g.getName().equals(p.getName()))) {
                    visits.merge(p.getName(), 1, Integer::sum);
                    group.add(p);
                }
            }
            if (group.size() < size) {
                List<Player> candidates = new ArrayList<>(players);
                candidates.removeIf(p -> group.stream().anyMatch(g -> g.getName().equals(p.getName())));
                Collections.shuffle(candidates, random);
                candidates.sort(Comparator.comparingInt((Player p) -> visits.getOrDefault(p.getName(), 0))
                        .thenComparing(Comparator.comparingInt(Player::getElo).reversed()));
                for (Player p : candidates.subList(0, Math.min(size - group.size(), candidates.size()))) {
                    if (visits.getOrDefault(p.getName(), 0) > 0) {
                        warnings.add("Übung " + (session * length + 1) + ": " + p.getName()
                                + " ist zum zweiten Mal beim Mentaltrainer.");
                    }
                    visits.merge(p.getName(), 1, Integer::sum);
                    group.add(p);
                }
            }
            group.sort(Comparator.comparingInt(Player::getElo).reversed());
            schedule.add(group);
        }
        return schedule;
    }

    private static Player findByName(List<Player> players, String name) {
        return players.stream().filter(p -> p.getName().equals(name)).findFirst().orElseThrow();
    }

    private ExerciseRound nextRound(List<Player> players, PlanSettings settings, History history,
            List<String> warnings, int exerciseNo, List<Player> mentalTrainer) {
        // Shuffle first so every stable sort below breaks ties differently each time
        List<Player> pool = new ArrayList<>(players);
        Collections.shuffle(pool, random);
        ExerciseRound round = new ExerciseRound();

        // 0. Mentaltrainer: the group of this session, decided up front
        round.setMentalTrainer(new ArrayList<>(mentalTrainer));
        pool.removeIf(p -> mentalTrainer.stream().anyMatch(m -> m.getName().equals(p.getName())));

        // 1. Balleimer: kids who have not been at one yet
        int slots = settings.balleimerSlots();
        if (slots > 0) {
            pool.sort(Comparator.comparingInt(p -> history.balleimer(p)));
            List<Player> chosen = new ArrayList<>(pool.subList(0, slots));
            pool.removeAll(chosen);
            for (Player p : chosen) {
                if (history.balleimer(p) > 0) {
                    warnings.add("Übung " + exerciseNo + ": " + p.getName() + " ist zum zweiten Mal am Balleimer.");
                }
            }
            // Similar levels share a Balleimer
            chosen.sort(Comparator.comparingInt(Player::getElo).reversed());
            int from = 0;
            for (int size : settings.getBalleimerSizes()) {
                round.getBalleimer().add(new ArrayList<>(chosen.subList(from, from + size)));
                from += size;
            }
        }

        // 2. Sparring: a kid this partner has not had yet, spreading sparring across kids
        for (String partner : settings.getSparringPartners()) {
            Player kid = Collections.min(pool, Comparator
                    .comparingInt((Player p) -> history.sparredWith(partner, p) ? 1 : 0)
                    .thenComparingInt(history::sparringCount));
            if (history.sparredWith(partner, kid)) {
                warnings.add("Übung " + exerciseNo + ": " + kid.getName() + " spielt zum zweiten Mal mit " + partner + ".");
            }
            pool.remove(kid);
            round.getSparring().add(new SparringAssignment(partner, kid));
        }

        // 3. Everyone else plays in pairs
        pairUp(pool, history, round, warnings, exerciseNo);
        return round;
    }

    /**
     * Minimum-cost perfect matching by branch and bound. A pair costs its
     * Elo gap plus REPEAT_PENALTY per earlier meeting; an odd group gets a
     * bye slot, and taking the bye costs REPEAT_PENALTY per earlier sit-out. The
     * first descent is greedy, so the budget always leaves a good matching.
     */
    private void pairUp(List<Player> pool, History history, ExerciseRound round, List<String> warnings,
            int exerciseNo) {
        List<Player> kids = new ArrayList<>(pool);
        kids.sort(Comparator.comparingInt(Player::getElo).reversed());
        boolean odd = kids.size() % 2 == 1;
        int n = kids.size() + (odd ? 1 : 0);
        int bye = odd ? n - 1 : -1;
        if (n == 0) {
            return;
        }

        int[][] cost = new int[n][n];
        int[] minCost = new int[n];
        Integer[][] order = new Integer[n][];
        for (int i = 0; i < n; i++) {
            minCost[i] = Integer.MAX_VALUE;
            for (int j = 0; j < n; j++) {
                if (i == j) {
                    continue;
                }
                if (i == bye || j == bye) {
                    cost[i][j] = REPEAT_PENALTY * history.sitOuts(kids.get(i == bye ? j : i));
                } else {
                    Player a = kids.get(i);
                    Player b = kids.get(j);
                    cost[i][j] = Math.abs(a.getElo() - b.getElo())
                            + REPEAT_PENALTY * history.meetings(a, b);
                }
                minCost[i] = Math.min(minCost[i], cost[i][j]);
            }
            final int row = i;
            List<Integer> partners = new ArrayList<>();
            for (int j = 0; j < n; j++) {
                if (j != i) {
                    partners.add(j);
                }
            }
            partners.sort(Comparator.comparingInt(j -> cost[row][j]));
            order[i] = partners.toArray(new Integer[0]);
        }

        Matcher m = new Matcher(cost, minCost, order);
        m.search(0, sum(minCost));

        for (int i = 0; i < n; i++) {
            int j = m.bestMate[i];
            if (j < i) {
                continue;
            }
            if (i == bye || j == bye) {
                Player sitter = kids.get(i == bye ? j : i);
                if (history.sitOuts(sitter) > 0) {
                    warnings.add("Übung " + exerciseNo + ": " + sitter.getName() + " ist zum zweiten Mal ohne Partner.");
                }
                round.getUnpaired().add(sitter);
            } else {
                Player a = kids.get(i);
                Player b = kids.get(j);
                if (history.meetings(a, b) > 0) {
                    warnings.add("Übung " + exerciseNo + ": " + a.getName() + " & " + b.getName() + " spielen zum zweiten Mal zusammen.");
                }
                round.getPairs().add(new PlayerPair(a, b));
            }
        }
    }

    private static final class Matcher {
        final int[][] cost;
        final int[] minCost;
        final Integer[][] order;
        final int[] mate;
        int[] bestMate;
        // Far below Long.MAX_VALUE so the doubled bound check cannot overflow
        long bestCost = Long.MAX_VALUE / 4;
        long nodes;

        Matcher(int[][] cost, int[] minCost, Integer[][] order) {
            this.cost = cost;
            this.minCost = minCost;
            this.order = order;
            this.mate = new int[cost.length];
            java.util.Arrays.fill(mate, -1);
        }

        // remainingMin: sum of minCost over unmatched vertices; half of it bounds what is left
        void search(long current, long remainingMin) {
            if (nodes++ > SEARCH_NODE_BUDGET && bestMate != null) {
                return;
            }
            int i = 0;
            while (i < mate.length && mate[i] != -1) {
                i++;
            }
            if (i == mate.length) {
                if (current < bestCost) {
                    bestCost = current;
                    bestMate = mate.clone();
                }
                return;
            }
            for (int j : order[i]) {
                if (mate[j] != -1) {
                    continue;
                }
                long next = current + cost[i][j];
                // Candidates are sorted by cost, so nothing further down can do better
                if (next >= bestCost) {
                    break;
                }
                long rest = remainingMin - minCost[i] - minCost[j];
                if (2 * next + rest >= 2 * bestCost) {
                    continue;
                }
                mate[i] = j;
                mate[j] = i;
                search(next, rest);
                mate[i] = -1;
                mate[j] = -1;
            }
        }
    }

    private static long sum(int[] values) {
        long total = 0;
        for (int v : values) {
            total += v;
        }
        return total;
    }

    /** Trims sparring names, drops blanks and duplicates, drops empty Balleimer, clamps the numbers. */
    private PlanSettings normalize(PlanSettings settings) {
        PlanSettings s = settings == null ? new PlanSettings() : settings;
        Set<String> partners = new LinkedHashSet<>();
        if (s.getSparringPartners() != null) {
            for (String name : s.getSparringPartners()) {
                if (name != null && !name.isBlank()) {
                    partners.add(name.trim());
                }
            }
        }
        List<Integer> sizes = new ArrayList<>();
        if (s.getBalleimerSizes() != null) {
            for (Integer size : s.getBalleimerSizes()) {
                if (size != null && size > 0) {
                    sizes.add(size);
                }
            }
        }
        PlanSettings clean = new PlanSettings(Math.max(1, s.getNumberOfExercises()), sizes, new ArrayList<>(partners),
                Math.max(0, s.getMentalTrainerKids()), Math.max(1, s.getMentalTrainerLength()));
        if (s.getMentalTrainerPicks() != null) {
            List<String> picks = new ArrayList<>();
            s.getMentalTrainerPicks().stream().filter(n -> n != null && !n.isBlank()).map(String::trim)
                    .distinct().forEach(picks::add);
            clean.setMentalTrainerPicks(picks);
        }
        return clean;
    }

    private void validate(List<Player> players, PlanSettings settings) {
        if (players == null || players.isEmpty()) {
            throw new IllegalArgumentException("Keine Spieler für dieses Datum.");
        }
        Set<String> names = new HashSet<>();
        for (Player p : players) {
            if (!names.add(p.getName())) {
                throw new IllegalArgumentException(p.getName() + " steht doppelt in der Spielerliste.");
            }
        }
        for (String partner : settings.getSparringPartners()) {
            if (names.contains(partner)) {
                throw new IllegalArgumentException(partner
                        + " steht in der Spielerliste und bei den Sparringpartnern – bitte nur an einer Stelle.");
            }
        }
        int needed = settings.balleimerSlots() + settings.getSparringPartners().size()
                + settings.getMentalTrainerKids();
        if (needed > players.size()) {
            throw new IllegalArgumentException("Pro Übung braucht es " + needed
                    + " Kinder für Mentaltrainer, Balleimer und Sparring, es sind aber nur " + players.size() + " da.");
        }
    }

    /** What earlier exercises already used, keyed by name. */
    private static final class History {
        private final Map<String, Integer> balleimer = new HashMap<>();
        private final Map<String, Integer> meetings = new HashMap<>();
        private final Map<String, Integer> sitOuts = new HashMap<>();
        private final Set<String> sparringPairs = new HashSet<>();
        private final Map<String, Integer> sparringCount = new HashMap<>();

        void record(ExerciseRound round) {
            for (List<Player> bucket : round.getBalleimer()) {
                for (Player p : bucket) {
                    balleimer.merge(p.getName(), 1, Integer::sum);
                }
            }
            for (PlayerPair pair : round.getPairs()) {
                meetings.merge(pairKey(pair.getPlayer1(), pair.getPlayer2()), 1, Integer::sum);
            }
            for (Player p : round.getUnpaired()) {
                sitOuts.merge(p.getName(), 1, Integer::sum);
            }
            for (SparringAssignment s : round.getSparring()) {
                sparringPairs.add(s.getPartner() + "\u0000" + s.getPlayer().getName());
                sparringCount.merge(s.getPlayer().getName(), 1, Integer::sum);
            }
        }

        int balleimer(Player p) {
            return balleimer.getOrDefault(p.getName(), 0);
        }

        int meetings(Player a, Player b) {
            return meetings.getOrDefault(pairKey(a, b), 0);
        }

        int sitOuts(Player p) {
            return sitOuts.getOrDefault(p.getName(), 0);
        }

        boolean sparredWith(String partner, Player p) {
            return sparringPairs.contains(partner + "\u0000" + p.getName());
        }

        int sparringCount(Player p) {
            return sparringCount.getOrDefault(p.getName(), 0);
        }

        private static String pairKey(Player a, Player b) {
            String x = a.getName();
            String y = b.getName();
            return x.compareTo(y) < 0 ? x + "\u0000" + y : y + "\u0000" + x;
        }
    }
}
