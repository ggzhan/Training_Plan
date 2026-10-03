package com.example.trainingplanner.model;

import java.util.ArrayList;
import java.util.List;

public class PlanSettings {
    private int numberOfExercises = 6;
    private int balleimerCount;
    private int playersPerBalleimer = 2;
    private List<String> sparringPartners = new ArrayList<>();

    public PlanSettings() {
    }

    public PlanSettings(int numberOfExercises, int balleimerCount, int playersPerBalleimer,
            List<String> sparringPartners) {
        this.numberOfExercises = numberOfExercises;
        this.balleimerCount = balleimerCount;
        this.playersPerBalleimer = playersPerBalleimer;
        this.sparringPartners = sparringPartners;
    }

    public int getNumberOfExercises() {
        return numberOfExercises;
    }

    public void setNumberOfExercises(int numberOfExercises) {
        this.numberOfExercises = numberOfExercises;
    }

    public int getBalleimerCount() {
        return balleimerCount;
    }

    public void setBalleimerCount(int balleimerCount) {
        this.balleimerCount = balleimerCount;
    }

    public int getPlayersPerBalleimer() {
        return playersPerBalleimer;
    }

    public void setPlayersPerBalleimer(int playersPerBalleimer) {
        this.playersPerBalleimer = playersPerBalleimer;
    }

    public List<String> getSparringPartners() {
        return sparringPartners;
    }

    public void setSparringPartners(List<String> sparringPartners) {
        this.sparringPartners = sparringPartners;
    }

    public int balleimerSlots() {
        return balleimerCount * playersPerBalleimer;
    }
}
