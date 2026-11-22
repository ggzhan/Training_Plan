package com.example.trainingplanner.model;

import java.util.ArrayList;
import java.util.List;

/**
 * One exercise: every kid is in exactly one of the pairs, a Balleimer, a sparring
 * slot, the Mentaltrainer or (when the rest comes out odd) without a partner.
 * A kid without a partner joins one pair as the third player: joins holds, for
 * each unpaired kid, the index of that pair (-1 when there is no pair to join).
 */
public class ExerciseRound {
    private List<PlayerPair> pairs = new ArrayList<>();
    private List<List<Player>> balleimer = new ArrayList<>();
    private List<SparringAssignment> sparring = new ArrayList<>();
    private List<Player> unpaired = new ArrayList<>();
    private List<Player> mentalTrainer = new ArrayList<>();
    private List<Integer> joins = new ArrayList<>();

    public List<PlayerPair> getPairs() {
        return pairs;
    }

    public void setPairs(List<PlayerPair> pairs) {
        this.pairs = pairs;
    }

    public List<List<Player>> getBalleimer() {
        return balleimer;
    }

    public void setBalleimer(List<List<Player>> balleimer) {
        this.balleimer = balleimer;
    }

    public List<SparringAssignment> getSparring() {
        return sparring;
    }

    public void setSparring(List<SparringAssignment> sparring) {
        this.sparring = sparring;
    }

    public List<Player> getMentalTrainer() {
        return mentalTrainer;
    }

    public void setMentalTrainer(List<Player> mentalTrainer) {
        this.mentalTrainer = mentalTrainer;
    }

    public List<Player> getUnpaired() {
        return unpaired;
    }

    public void setUnpaired(List<Player> unpaired) {
        this.unpaired = unpaired;
    }

    public List<Integer> getJoins() {
        return joins;
    }

    public void setJoins(List<Integer> joins) {
        this.joins = joins == null ? new ArrayList<>() : joins;
    }

    /** The pair an unpaired kid plays with, or -1. */
    public int joinOf(int unpairedIndex) {
        if (joins == null || unpairedIndex >= joins.size()) {
            return -1;
        }
        Integer pair = joins.get(unpairedIndex);
        return pair == null || pair < 0 || pair >= pairs.size() ? -1 : pair;
    }
}
