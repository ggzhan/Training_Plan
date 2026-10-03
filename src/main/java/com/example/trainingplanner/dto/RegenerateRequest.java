package com.example.trainingplanner.dto;

import com.example.trainingplanner.model.TrainingPlan;

public class RegenerateRequest {
    private TrainingPlan plan;
    // Exercises 0..keepThrough stay as they are; the rest is generated anew
    private int keepThrough;

    public TrainingPlan getPlan() {
        return plan;
    }

    public void setPlan(TrainingPlan plan) {
        this.plan = plan;
    }

    public int getKeepThrough() {
        return keepThrough;
    }

    public void setKeepThrough(int keepThrough) {
        this.keepThrough = keepThrough;
    }
}
