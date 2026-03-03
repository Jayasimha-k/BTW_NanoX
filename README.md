# BTW_NanoX
# Real-Time Thermal Monitoring & Load Control System

## Overview

This project is a simple real-time thermal monitoring and control system built using:

- ESP32 (WiFi enabled microcontroller)
- AMG8833 8x8 Thermal Camera
- LED (representing an electrical load)
- Web-based dashboard

The system visualizes temperature data and allows users to turn off a connected load to reduce unnecessary energy usage.

---

## Problem Statement

Energy is often wasted because devices remain ON even when not needed. 

There is usually no simple way to:

- Visualize temperature changes in real time
- Detect abnormal heat conditions
- Control devices instantly from a monitoring system

---

## Proposed Solution

This system:

1. Reads thermal data from the AMG8833 sensor.
2. Sends temperature data to a web interface using ESP32 WiFi.
3. Displays a live 8x8 thermal heatmap.
4. Detects abnormal temperature rise using threshold logic.
5. Allows the user to turn OFF the connected load (LED) from the web interface.

This creates a simple monitoring-to-control loop.

---
## Architecture Diagram

![Architecture](architecture.png)
## System Architecture

ESP32 collects thermal data from the AMG8833 sensor.

The ESP32 hosts a web server.

The web page:
- Fetches thermal data.
- Displays a heatmap.
- Provides ON/OFF control for the LED.

---

## Thermal Detection Logic

- Calculate average temperature.
- Detect pixels above a defined threshold.
- Flag potential overheating conditions.

---

## Features

- Live thermal visualization
- Real-time temperature updates
- Simple anomaly detection
- Manual load control from browser
- WiFi-based communication

---

## Future Improvements

- Add automatic shutdown mode
- Integrate power consumption measurement
- Add cloud data logging
- Support multiple sensors
- Add AI-based anomaly classification

---

## Conclusion

This project demonstrates how thermal monitoring combined with simple web-based control can help reduce unnecessary energy usage in small systems.