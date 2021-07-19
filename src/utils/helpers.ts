import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import moment from 'moment';
import { constants } from '../utils/constants';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

export class Helpers {
  hashPassword(password: string): string {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8));
  }

  comparePassword(hashPassword: string, password: string): boolean {
    return bcrypt.compareSync(password, hashPassword);
  }

  isValidEmail(email:string ): boolean {
    return /\S+@\S+\.\S+/.test(email);
  }

  generateAccessToken(id: string): string {
    return jwt.sign({
      userId: id
    },
      process.env.JWT_SECRET_KEY as string, { expiresIn: '365d' }
    );
  }

  generateRefreshToken(): string {
    return uuidv4();
  }

  checkArraysEqual(a1: Array<string>, a2: Array<string>): boolean {
    return JSON.stringify(a1) == JSON.stringify(a2);
  }
  
  getNextDayOfWeek(dayOfWeek: string): string {
    let date = moment();
    while (constants.DAYS_OF_WEEK[date.isoWeekday() - 1] != dayOfWeek) {
      date = date.add(1, 'd');
    }
    return constants.DAYS_OF_WEEK[date.add(1, 'd').isoWeekday() - 1];
  }
}
