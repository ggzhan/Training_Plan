package com.example.trainingplanner.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PlanSettings {
    private int numberOfExercises = 6;
    // Kids per Balleimer, one entry per Balleimer, e.g. [3, 2]
    private List<Integer> balleimerSizes = new ArrayList<>();
    private List<String> sparringPartners = new ArrayList<>();

    // Plans saved before per-Balleimer sizes had one count and one size for all
    private int legacyBalleimerCount;
    private int legacyPlayersPerBalleimer;

    public PlanSettings() {
    }

    public PlanSettings(int numberOfExercises, List<Integer> balleimerSizes, List<String> sparringPartners) {
        this.numberOfExercises = numberOfExercises;
        this.balleimerSizes = balleimerSizes;
        this.sparringPartners = sparringPartners;
    }

    public int getNumberOfExercises() {
        return numberOfExercises;
    }

    public void setNumberOfExercises(int numberOfExercises) {
        this.numberOfExercises = numberOfExercises;
    }

    public List<Integer> getBalleimerSizes() {
        if ((balleimerSizes == null || balleimerSizes.isEmpty()) && legacyBalleimerCount > 0) {
            return new ArrayList<>(Collections.nCopies(legacyBalleimerCount, Math.max(1, legacyPlayersPerBalleimer)));
        }
        return balleimerSizes;
    }

    public void setBalleimerSizes(List<Integer> balleimerSizes) {
        this.balleimerSizes = balleimerSizes;
    }

    // Write-only: read from old saved plans, never written back
    public void setBalleimerCount(int balleimerCount) {
        this.legacyBalleimerCount = balleimerCount;
    }

    public void setPlayersPerBalleimer(int playersPerBalleimer) {
        this.legacyPlayersPerBalleimer = playersPerBalleimer;
    }

    public List<String> getSparringPartners() {
        return sparringPartners;
    }

    public void setSparringPartners(List<String> sparringPartners) {
        this.sparringPartners = sparringPartners;
    }

    public int balleimerSlots() {
        int total = 0;
        for (int size : getBalleimerSizes()) {
            total += size;
        }
        return total;
    }
}
