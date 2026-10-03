package com.example.trainingplanner.model;

public class SparringAssignment {
    private String partner;
    private Player player;

    public SparringAssignment() {
    }

    public SparringAssignment(String partner, Player player) {
        this.partner = partner;
        this.player = player;
    }

    public String getPartner() {
        return partner;
    }

    public void setPartner(String partner) {
        this.partner = partner;
    }

    public Player getPlayer() {
        return player;
    }

    public void setPlayer(Player player) {
        this.player = player;
    }
}
