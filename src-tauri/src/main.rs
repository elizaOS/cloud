//! Eliza Cloud Mobile App - Main Entry Point
//!
//! This is the main entry point for the Tauri application.
//! It sets up the application with all necessary plugins and commands.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    eliza_cloud_lib::run();
}

