package com.example.trainingplanner.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.Objects;

public class Player {
    private String name;
    private int elo;

    public Player() {
    }

    public Player(String name) {
        this.name = name;
    }

    public Player(String name, int elo) {
        this.name = name;
        this.elo = elo;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getElo() {
        return elo;
    }

    // Plans and lists saved before the sheet switched to Elo call it "klassierung"
    @JsonAlias("klassierung")
    public void setElo(int elo) {
        this.elo = elo;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Player player = (Player) o;
        return elo == player.elo && Objects.equals(name, player.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, elo);
    }

    @Override
    public String toString() {
        return "Player{" +
                "name='" + name + '\'' +
                ", elo=" + elo +
                '}';
    }
}
