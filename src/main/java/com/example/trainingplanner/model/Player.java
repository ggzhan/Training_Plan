package com.example.trainingplanner.model;

import java.util.Objects;

public class Player {
    private String name;
    private int klassierung;

    public Player() {
    }

    public Player(String name) {
        this.name = name;
    }

    public Player(String name, int klassierung) {
        this.name = name;
        this.klassierung = klassierung;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getKlassierung() {
        return klassierung;
    }

    public void setKlassierung(int klassierung) {
        this.klassierung = klassierung;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Player player = (Player) o;
        return klassierung == player.klassierung && Objects.equals(name, player.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, klassierung);
    }

    @Override
    public String toString() {
        return "Player{" +
                "name='" + name + '\'' +
                ", klassierung=" + klassierung +
                '}';
    }
}
