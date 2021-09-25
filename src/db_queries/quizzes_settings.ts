import { Request, Response } from 'express';
import autoBind from 'auto-bind';
import pg from 'pg';
import { Conn } from '../db/conn';
import QuizSettings from '../models/quiz_settings.model';

const conn = new Conn();
const pool = conn.pool;

export class QuizzesSettings {
  constructor() {
    autoBind(this);
  }

  async getQuizzesSettings(request: Request, response: Response): Promise<void> {
    try {
      const quizzesSettings = await this.getQuizzesSettingsFromDB();
      response.status(200).json(quizzesSettings);
    } catch (error) {
      response.status(400).send(error);
    } 
  }

  async getQuizzesSettingsFromDB(): Promise<QuizSettings> {
    const getQuizzesSettingsQuery = 'SELECT student_weekly_count, mentor_weekly_count FROM quizzes_settings';
    const { rows }: pg.QueryResult = await pool.query(getQuizzesSettingsQuery);
    return {
      studentWeeklyCount: rows[0].student_weekly_count,
      mentorWeeklyCount: rows[0].mentor_weekly_count
    }    
  }
}

