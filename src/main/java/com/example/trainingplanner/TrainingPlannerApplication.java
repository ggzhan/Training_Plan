package com.example.trainingplanner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TrainingPlannerApplication {

	public static void main(String[] args) {
		SpringApplication.run(TrainingPlannerApplication.class, args);
	}

}
