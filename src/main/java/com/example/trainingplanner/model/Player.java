package com.example.trainingplanner.model;

import java.util.Objects;

public class Player {
    private String name;
    private int elo;

    public Player() {
    }

    public Player(String name) {
        this.name = name;
        this.elo = 1; // Default Elo
    }

    public Player(String name, int elo) {
        this.name = name;
        setElo(elo);
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

    public void setElo(int elo) {
        if (elo < 1 || elo > 4000) {
            // Warn but maybe clamp or allow for now?
            // The requirement says "between 1 and 4000".
            // I will enforce it but provide a fallback or just throw?
            // Given it's a simple app, I'll clamp it or throw.
            // Let's throw IllegalArgumentException to be safe,
            // but for data loading from CSV/Sheets, we might want to be lenient.
            // Actually, let's clamp it for safety during data load,
            // but the UI will enforce it.
            if (elo < 1)
                elo = 1;
            if (elo > 4000)
                elo = 4000;
        }
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
