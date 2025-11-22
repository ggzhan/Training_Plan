package com.example.trainingplanner.model;

import java.util.Objects;

public class PlayerPair {
    private Player player1;
    private Player player2;

    public PlayerPair() {
    }

    public PlayerPair(Player player1, Player player2) {
        this.player1 = player1;
        this.player2 = player2;
    }

    public Player getPlayer1() {
        return player1;
    }

    public void setPlayer1(Player player1) {
        this.player1 = player1;
    }

    public Player getPlayer2() {
        return player2;
    }

    public void setPlayer2(Player player2) {
        this.player2 = player2;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        PlayerPair that = (PlayerPair) o;
        return Objects.equals(player1, that.player1) && Objects.equals(player2, that.player2);
    }

    @Override
    public int hashCode() {
        return Objects.hash(player1, player2);
    }

    @Override
    public String toString() {
        return "PlayerPair{" +
                "player1=" + player1 +
                ", player2=" + player2 +
                '}';
    }
}
