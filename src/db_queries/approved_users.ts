import { Request, Response } from 'express';
import pg from 'pg';
import autoBind from 'auto-bind';
import { Conn } from '../db/conn';
import ApprovedUser from '../models/approved_user.model';

const conn = new Conn();
const pool = conn.pool;

export class ApprovedUsers {
  constructor() {
    autoBind(this);
  }

  async addApprovedUser(request: Request, response: Response): Promise<void> {
    const { email, organization, isMentor }: ApprovedUser = request.body    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (organization) {
        if (!organization?.name) {
          organization.id = '1838ae4e-4d07-4b03-8c7e-e1aa07fa9835'; // Other organization
        } else {
          const getOrganizationQuery = 'SELECT id FROM organizations WHERE name = $1';
          const { rows }: pg.QueryResult = await client.query(getOrganizationQuery, [organization.name]);
          if (rows[0]) {
            organization.id = rows[0].id;
          }
        }
      }
      const fieldId = 'b021984a-c02c-4fd4-87a7-1aec84c68d6b'; // Programming
      const goal = 'I want to have an income of at least $1000 USD per month';
      let insertApprovedUserQuery;
      let values;
      if (isMentor) {
        insertApprovedUserQuery = `INSERT INTO approved_users (email, field_id, organization_id, is_mentor)
          VALUES ($1, $2, $3, $4)`;
        values = [email, fieldId, organization?.id, isMentor];
      } else {
        insertApprovedUserQuery = `INSERT INTO approved_users (email, organization_id, is_mentor, goal)
          VALUES ($1, $2, $3, $4)`;
        values = [email, organization?.id, isMentor, goal];        
      }
      await client.query(insertApprovedUserQuery, values);
      response.status(200).send('Approved user has been added');
      await client.query('COMMIT');
    } catch (error) {
      response.status(400).send(error);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }  
}

