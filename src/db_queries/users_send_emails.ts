import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import autoBind from 'auto-bind';
import moment from 'moment';
import 'moment-timezone';
import pg from 'pg';
import dotenv from 'dotenv';
import { Conn } from '../db/conn';
import { Users } from './users';
import { UsersTimeZones } from './users_timezones';
import { constants } from '../utils/constants';
import { Helpers } from '../utils/helpers';
import Lesson from '../models/lesson.model';
import User from '../models/user.model';
import Email from '../models/email.model';
import LessonRequest from '../models/lesson_request.model';

const conn = new Conn();
const pool = conn.pool;
const users = new Users();
const usersTimeZones = new UsersTimeZones();
const helpers = new Helpers();
dotenv.config();

export class UsersSendEmails {
  constructor() {
    autoBind(this);
  }

  sendEmail(recipientEmailAddress: string, email: Email): void {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER as string,
      port: parseInt(process.env.SMTP_PORT as string),
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });

    if (recipientEmailAddress && recipientEmailAddress.indexOf('fake') == -1) {
      transporter.sendMail({
        to: recipientEmailAddress,
        from: process.env.SMTP_SENDER,
        subject: email.subject,
        html: email.body
      })
        .then(() => console.log(`Email successfully sent: ${recipientEmailAddress}`))
        .catch(() => console.log(`Email hasn't been sent successfully: ${recipientEmailAddress}`))
    }
  }

  sendEmailFirstTrainingReminder(user: User, showStepReminder: boolean, showQuizReminder: boolean, remainingQuizzes: number): void {
    const userFirstName = helpers.getUserFirstName(user);
    let body = '';
    const quizzes = this.getRemainingQuizzesText(remainingQuizzes);
    if (showStepReminder && !showQuizReminder) {
      body += 'This is a gentle reminder to add a new step to your plan in the MWB Connect app.';
    } else if (showStepReminder && showQuizReminder) {
      body += `This is a gentle reminder to add a new step to your plan and to solve the ${quizzes} in the MWB Connect app.`;
    } else if (!showStepReminder && showQuizReminder) {
      body += `This is a gentle reminder to solve the ${quizzes} in the MWB Connect app.`;
    }
    body = this.setEmailBody(userFirstName, body);
    const email: Email = {
      subject: 'Training reminder',
      body: body
    }
    if (showStepReminder || showQuizReminder) {    
      this.sendEmail(user?.email as string, email);   
    }
  }
  
  getRemainingQuizzesText(remainingQuizzes: number): string {
    let quizzes = '';
    switch(remainingQuizzes) {
      case 1:
        quizzes = 'remaining quiz';
        break;
      case 3:
        quizzes = 'training quizzes';
        break;
      default:
        quizzes = `remaining ${remainingQuizzes} quizzes`;
    }
    return quizzes;    
  }

  sendEmailLastTrainingReminder(user: User, showStepReminder: boolean, showQuizReminder: boolean, remainingQuizzes: number): void {
    const userFirstName = helpers.getUserFirstName(user);
    let body = '';
    const quizzes = this.getRemainingQuizzesText(remainingQuizzes);
    if (showStepReminder && !showQuizReminder) {
      body += 'This is a gentle reminder that today is the last day for adding a new step to your plan in the MWB Connect app.';
    } else if (showStepReminder && showQuizReminder) {
      body += `This is a gentle reminder that today is the last day for adding a new step to your plan and for solving the ${quizzes} in the MWB Connect app.`;
    } else if (!showStepReminder && showQuizReminder) {
      body += `This is a gentle reminder that today is the last day for solving the ${quizzes} in the MWB Connect app.`;
    }
    body = this.setEmailBody(userFirstName, body);
    const email: Email = {
      subject: 'Training reminder',
      body: body
    }
    if (showStepReminder || showQuizReminder) {    
      this.sendEmail(user?.email as string, email);   
    }
  }  

  sendEmailStudentAddedToLesson(student: User, lesson: Lesson): void {
    const studentFirstName = helpers.getUserFirstName(student);
    const mentorName = lesson.mentor?.name;
    const mentorFirstName = helpers.getUserFirstName(lesson.mentor as User);
    const fieldName = student.field?.name?.toLowerCase();
    const isLessonRecurrent = helpers.isLessonRecurrent(lesson.dateTime as string, lesson.endRecurrenceDateTime);
    const recurring = isLessonRecurrent ? 'recurring ' : '';
    const lessonRecurrence = isLessonRecurrent ? 'lesson recurrence' : 'next lesson';
    // Send email to student
    let body = `You have been added to a ${recurring}${fieldName} lesson with ${mentorName}. Please see the details in the MWB Connect app.`;
    body = this.setEmailBody(studentFirstName, body);
    const emailStudent: Email = {
      subject: 'Lesson scheduled',
      body: body
    }
    this.sendEmail(student?.email as string, emailStudent);
    // Send email to mentor
    body = `Hi ${mentorFirstName},<br><br>`;
    body += `${student.name} from ${student.organization?.name} has been added to the ${lessonRecurrence}.<br><br>`;
    body += `The student's contact details are as follows:`;
    body += `<ul>`;
    body += `<li><b>${student.name}</b></li>`;
    body += `<ul>`;
    body += `<li>Email: ${student.email}</li>`;
    if (student.phoneNumber) {
      body += `<li>WhatsApp number: ${student.phoneNumber}</li>`;
    }
    body += `</ul><br>`;
    body += `</ul>`;
    body += `Regards,<br>MWB Support Team`; 
    const emailMentor: Email = {
      subject: `Student added to ${lessonRecurrence}`,
      body: body
    }    
    this.sendEmail(lesson.mentor?.email as string, emailMentor);
  }

  setEmailBody(userName: string, body: string): string {
    return `Hi ${userName},<br><br>${body}<br><br>Regards,<br>MWB Support Team`;
  }

  async sendEmailLessonRequest(lessonRequest: LessonRequest, client: pg.PoolClient): Promise<void> {
    const mentor = lessonRequest.mentor;
    const student = lessonRequest.student;
    const subfield = lessonRequest.subfield;
    const mentorFirstName = helpers.getUserFirstName(mentor as User);
    const mentorEmailAddress = mentor?.email;
    const subfieldName = subfield?.name?.toLowerCase();
    const userTimeZone = await usersTimeZones.getUserTimeZone(mentor?.id as string, client);
    const now = moment.utc().tz(userTimeZone.name);
    const deadline = now.add(1, 'd').format(constants.DATE_FORMAT_LESSON);
    let body = `${student?.name} from ${student?.organization?.name} is requesting a ${subfieldName} lesson with you.<br><br>You can find the details of the lesson request in the MWB Connect app and we will kindly ask you to accept or reject the request until the end of the day on <b>${deadline}</b> so that the student can connect with another mentor if needed.`;
    body = this.setEmailBody(mentorFirstName, body);
    const email: Email = {
      subject: 'New lesson request',
      body: body
    }
    this.sendEmail(mentorEmailAddress as string, email);
  }
  
  async sendEmailLessonRequestReminder(lessonRequest: LessonRequest): Promise<void> {
    const mentor = lessonRequest.mentor;
    const student = lessonRequest.student;
    const mentorFirstName = helpers.getUserFirstName(mentor as User);
    const studentFirstName = helpers.getUserFirstName(student as User);
    const mentorEmailAddress = mentor?.email;
    let body = `Kindly remember to accept or reject ${studentFirstName}'s lesson request until the end of the day today so that the student can connect with another mentor if needed.`;
    body = this.setEmailBody(mentorFirstName, body);
    const email: Email = {
      subject: 'Lesson request reminder',
      body: body
    }
    this.sendEmail(mentorEmailAddress as string, email);
  }
  
  sendEmailLessonRequestAccepted(lesson: Lesson): void {
    const isLessonRecurrent = helpers.isLessonRecurrent(lesson.dateTime as string, lesson.endRecurrenceDateTime);
    const recurring = isLessonRecurrent ? 'recurring ' : '';
    const mentorName = lesson.mentor?.name;
    const students = lesson.students;
    const student = students != null ? students[0] : {};
    const studentFirstName = helpers.getUserFirstName(student);
    const fieldName = student.field?.name?.toLowerCase();
    let body = `${mentorName} has scheduled a ${recurring}${fieldName} lesson with you. Please see the details in the MWB Connect app.`
    body = this.setEmailBody(studentFirstName, body);
    const email: Email = {
      subject: 'Lesson request accepted',
      body: body
    }
    this.sendEmail(student?.email as string, email);
  }

  sendEmailLessonRequestRejected(lessonRequest: LessonRequest, text: string): void {
    const mentor = lessonRequest.mentor as User;
    const student = lessonRequest.student as User;    
    const mentorName = mentor?.name;
    const studentFirstName = helpers.getUserFirstName(student);
    let mentorMessage = '';
    if (text) {
      mentorMessage = ` with the following message: "${text}"`;
    }    
    let body = `We're sorry but ${mentorName} has rejected your lesson request${mentorMessage}. Please find a new mentor in the MWB Connect app.`;
    body = this.setEmailBody(studentFirstName, body);
    const email: Email = {
      subject: 'Lesson request rejected',
      body: body
    }
    this.sendEmail(student?.email as string, email);
  }
  
  sendEmailLessonRequestExpired(lessonRequest: LessonRequest): void {
    const mentor = lessonRequest.mentor as User;
    const student = lessonRequest.student as User;
    const mentorFirstName = helpers.getUserFirstName(mentor);
    const studentFirstName = helpers.getUserFirstName(student);
    let body = `We're sorry but your lesson request has expired due to ${mentorFirstName}'s unavailability. Please find a new mentor in the MWB Connect app.`;
    body = this.setEmailBody(studentFirstName, body);
    const email: Email = {
      subject: 'Lesson request expired',
      body: body
    }
    this.sendEmail(student?.email as string, email);
  }  

  async sendEmailLessonScheduled(mentor: User, lesson: Lesson, client: pg.PoolClient): Promise<void> {
    const mentorFirstName = helpers.getUserFirstName(mentor);
    let student: User = {};
    if (lesson.students != null && lesson.students.length > 0) {
      student = lesson.students[0];
    }
    const isLessonRecurrent = helpers.isLessonRecurrent(lesson.dateTime as string, lesson.endRecurrenceDateTime);
    const recurring = isLessonRecurrent ? 'recurring ' : '';
    const onOrStartingFrom = isLessonRecurrent ? 'starting from ' : 'on ';
    const subfieldName = lesson.subfield != null ? lesson.subfield?.name?.toLowerCase() : '';
    const meetingUrl = lesson.meetingUrl;
    const userTimeZone = await usersTimeZones.getUserTimeZone(mentor.id as string, client);
    const lessonDate = moment.utc(lesson.dateTime).tz(userTimeZone.name).format(constants.DATE_FORMAT_LESSON);
    const lessonTime = moment.utc(lesson.dateTime).tz(userTimeZone.name).format(constants.TIME_FORMAT_LESSON) + ' ' + userTimeZone.abbreviation;
    let body = `Hi ${mentorFirstName},<br><br>Thank you for scheduling a ${recurring} ${subfieldName} lesson ${onOrStartingFrom} ${lessonDate} at ${lessonTime}.<br><br>`;
    body += `The meeting link is: <a href="${meetingUrl}" target="_blank">${meetingUrl}</a><br><br>`;
    body += `The student's contact details are as follows:`;
    body += `<ul>`;
    body += `<li><b>${student.name}</b></li>`;
    body += `<ul>`;
    body += `<li>Email: ${student.email}</li>`;
    if (student.phoneNumber) {
      body += `<li>WhatsApp number: ${student.phoneNumber}</li>`;
    }
    body += `</ul><br>`;
    body += `</ul>`;
    body += `Regards,<br>MWB Support Team`;
    const email: Email = {
      subject: 'Lesson scheduled',
      body: body
    }
    this.sendEmail(mentor?.email as string, email);   
  }  
  
  sendEmailLessonCanceled(lesson: Lesson, student: User, isCancelAll: boolean, lessonsCanceled: number): void {
    const isMentor = lesson.mentor == null ? true : false;
    if (isMentor) { // canceled by mentor
      this.sendEmailLessonCanceledStudents(lesson, isCancelAll);
    } else {
      this.sendEmailLessonCanceledMentor(lesson, student, isCancelAll, lessonsCanceled);
    }
  }
  
  sendEmailLessonCanceledStudents(lesson: Lesson, isCancelAll: boolean): void {
    let subject = '';
    let body = '';
    const isLessonRecurrent = helpers.isLessonRecurrent(lesson.dateTime as string, lesson.endRecurrenceDateTime);
    let message = '';
    if (lesson.reasonCanceled) {
      message = ` with the following message: "${lesson.reasonCanceled}"`;
    }
    if (isLessonRecurrent && isCancelAll) {
      subject = 'Lesson recurrence canceled';
      body = `We're sorry but the mentor has canceled the lesson recurrence${message}. Please feel free to use the MWB Connect app in order to find a new mentor.`;
    } else {
      subject = 'Next lesson canceled';
      body = `We're sorry but the mentor has canceled the next lesson${message}. If there aren't any other lessons scheduled, please feel free to use the MWB Connect app in order to find a new mentor.`;
    }    
    if (lesson.students != null) {
      for (const student of lesson.students) {
        const studentFirstName = helpers.getUserFirstName(student);
        const email: Email = {
          subject: subject,
          body: this.setEmailBody(studentFirstName, body)
        }
        this.sendEmail(student.email as string, email);
      }
    }
  }

  sendEmailLessonCanceledMentor(lesson: Lesson, student: User, isCancelAll: boolean, lessonsCanceled: number): void {
    let subject = '';
    let body = '';
    let message = '';
    let reason = '';
    if (lesson.reasonCanceled) {
      message = ` with the following message: "${lesson.reasonCanceled}"`;
      reason = ` for the following reason: "${lesson.reasonCanceled}"`;
    }     
    if (lessonsCanceled == 0) {
      const studentName = student.name;
      const isLessonRecurrent = helpers.isLessonRecurrent(lesson.dateTime as string, lesson.endRecurrenceDateTime);
      const lessonRecurrence = isLessonRecurrent && isCancelAll ? 'lesson recurrence' : 'next lesson';
      subject = 'Next lesson status';
      body = `${studentName} won't participate in the ${lessonRecurrence}${reason}.`;
    } else if (lessonsCanceled == 1) {
      subject = 'Next lesson canceled';
      body = `The next lesson has been canceled by the only participant${message}.`;
    } else {
      subject = 'Next lessons canceled';
      body = `The next ${lessonsCanceled} lessons have been canceled by the only participant${message}.`;
    }  
    if (lesson.mentor != null) {
      const mentorFirstName = helpers.getUserFirstName(lesson.mentor);
      const email: Email = {
        subject: subject,
        body: this.setEmailBody(mentorFirstName, body)
      }        
      this.sendEmail(lesson.mentor.email as string, email);
    }
  }
  
  sendEmailLessonRecurrenceUpdated(students: Array<User>): void {  
    if (students != null && students.length > 0) {
      for (const student of students) {
        const studentFirstName = helpers.getUserFirstName(student);
        let body = 'The mentor has updated the lesson recurrence. Please see the new details in the MWB Connect app.';
        body = this.setEmailBody(studentFirstName, body);
        const email: Email = {
          subject: 'Lesson recurrence updated',
          body: body
        }          
        this.sendEmail(student.email as string, email);
      }
    }
  }  

  async sendEmailLessonReminder(nextLesson: Lesson, client: pg.PoolClient): Promise<void> {
    const nextLessonStudents = nextLesson.students;
    if (nextLessonStudents != null && nextLessonStudents.length > 0) {
      const students: Array<User> = [];
      for (const nextLessonStudent of nextLessonStudents) {
        const student = await users.getUserFromDB(nextLessonStudent.id as string, client);
        students.push(student);
        this.sendEmailLessonReminderStudent(nextLesson, student, client);
      }
      nextLesson.students = students;
      await this.sendEmailLessonReminderMentor(nextLesson, client);
    }
  }

  async sendEmailLessonReminderMentor(nextLesson: Lesson, client: pg.PoolClient): Promise<void> {
    const mentor = nextLesson.mentor as User;
    const students = nextLesson.students as Array<User>;
    const mentorFirstName = helpers.getUserFirstName(mentor);
    const studentOrStudents = students.length > 1 ? 'students' : 'student';
    const isOrAre = students.length > 1 ? 'are' : 'is';
    const himHerOrThem = students.length > 1 ? 'them' : 'him/her';
    const meetingUrl = nextLesson.meetingUrl;
    const userTimeZone = await usersTimeZones.getUserTimeZone(mentor.id as string, client);
    const lessonTime = moment.utc(nextLesson.dateTime).tz(userTimeZone.name).format(constants.TIME_FORMAT_LESSON) + ' ' + userTimeZone.abbreviation;
    let body = `Hi ${mentorFirstName},<br><br>This is a gentle reminder to conduct the next lesson at ${lessonTime}.<br><br>`;
    body += `The meeting link is: <a href="${meetingUrl}" target="_blank">${meetingUrl}</a><br><br>`;
    body += `If the ${studentOrStudents} ${isOrAre}n't able to join the session, you can message ${himHerOrThem} using the following contact details (<b>WhatsApp</b> usually works best):`;
    body += `<ul>`;
    for (const student of students) {
      body += `<li><b>${student.name}</b></li>`;
      body += `<ul>`;
      body += `<li>Email: ${student.email}</li>`;
      if (student.phoneNumber) {
        body += `<li>WhatsApp number: ${student.phoneNumber}</li>`;
      }
      body += `</ul><br>`;
    }
    body += `</ul>`;
    body += `Regards,<br>MWB Support Team`;
    const email: Email = {
      subject: 'Next lesson in 30 mins',
      body: body
    }
    this.sendEmail(mentor?.email as string, email);   
  }

  async sendEmailLessonReminderStudent(nextLesson: Lesson, student: User, client: pg.PoolClient): Promise<void> {
    const mentor = nextLesson.mentor;
    const studentFirstName = helpers.getUserFirstName(student);
    const meetingUrl = nextLesson.meetingUrl;
    const userTimeZone = await usersTimeZones.getUserTimeZone(student.id as string, client);
    const lessonTime = moment.utc(nextLesson.dateTime).tz(userTimeZone.name).format(constants.TIME_FORMAT_LESSON) + ' ' + userTimeZone.abbreviation;
    let body = `This is a gentle reminder to participate in the next lesson at ${lessonTime}.<br><br>`;
    body += `The meeting link is: <a href="${meetingUrl}" target="_blank">${meetingUrl}</a><br><br>`;
    body += `If you aren't able to join the session, please notify your mentor, ${mentor?.name}, at: ${mentor?.email}`;
    body = this.setEmailBody(studentFirstName, body);
    const email: Email = {
      subject: 'Next lesson in 30 mins',
      body: body
    }
    this.sendEmail(student?.email as string, email);  
  }
  
  async sendEmailFirstAddLessonsReminder(lesson: Lesson, client: pg.PoolClient): Promise<void> {
    const mentor = lesson?.mentor as User;
    const students = lesson?.students as Array<User>;
    const mentorFirstName = helpers.getUserFirstName(mentor);
    const mentorEmailAddress = mentor?.email;
    const userTimeZone = await usersTimeZones.getUserTimeZone(mentor?.id as string, client);
    const now = moment.utc().tz(userTimeZone.name);
    let lessonsText = '1 lesson';
    if (helpers.isLessonRecurrent(lesson.dateTime as string, lesson?.endRecurrenceDateTime)) {
      const lessonDateTime = moment.utc(lesson.dateTime);
      const endRecurrenceDateTime = moment.utc(lesson?.endRecurrenceDateTime);
      const lessonsNumber = endRecurrenceDateTime.diff(lessonDateTime, 'weeks');
      lessonsText = `${lessonsNumber} lessons`;
    }
    let studentsFirstNames = '';
    if (students.length == 1) {
      studentsFirstNames = helpers.getUserFirstName(students[0]);
    } else if (students.length == 2) {
      studentsFirstNames = helpers.getUserFirstName(students[0]) + ' and ' + helpers.getUserFirstName(students[1]);
    } else {
      for (let i = 0; i < students.length - 1; i++) {
        studentsFirstNames += helpers.getUserFirstName(students[i]) + ', ';
      }
      studentsFirstNames = studentsFirstNames.slice(0, -2);
      studentsFirstNames += ', and ' + helpers.getUserFirstName(students[students.length-1]);
    }
    const himHerThem = students.length == 1 ? 'him/her' : 'them';
    const deadline = now.add(1, 'd').format(constants.DATE_FORMAT_LESSON);    
    let body = `Thank you for having done ${lessonsText} with ${studentsFirstNames}.<br><br>If you can add more lessons with ${himHerThem}, kindly remember to do that in the MWB Connect app until the end of the day on <b>${deadline}</b>.`;
    body = this.setEmailBody(mentorFirstName, body);
    const email: Email = {
      subject: 'Add more lessons',
      body: body
    }
    this.sendEmail(mentorEmailAddress as string, email);
  }

  async sendEmailLastAddLessonsReminder(lesson: Lesson): Promise<void> {
    const mentor = lesson?.mentor as User;
    const students = lesson?.students as Array<User>;
    const studentsText = students?.length == 1 ? 'student' : 'students';
    const mentorFirstName = helpers.getUserFirstName(mentor);
    const mentorEmailAddress = mentor?.email;
    let body = `Kindly remember to add more lessons (if possible) with your previous ${studentsText} in the MWB Connect app until the end of the day today.`;
    body = this.setEmailBody(mentorFirstName, body);
    const email: Email = {
      subject: 'Add more lessons - last day reminder',
      body: body
    }
    this.sendEmail(mentorEmailAddress as string, email);
  }

  sendEmailNoMoreLessonsAdded(mentor: User, student: User): void {
    const studentFirstName = helpers.getUserFirstName(student);
    const mentorFirstName = helpers.getUserFirstName(mentor);
    let body = `We're sorry but ${mentorFirstName} couldn't schedule more lessons. Please find a new mentor in the MWB Connect app.`;
    body = this.setEmailBody(studentFirstName, body);
    const email: Email = {
      subject: 'No more lessons added',
      body: body
    }
    this.sendEmail(student?.email as string, email);  
  }  

  sendEmailResetPassword(emailAddress: string, id: string): void {
    const link = `https://www.mentorswithoutborders.net/reset-password.php?uuid=${id}`;
    const body = `Please use the link below in order to reset your password:<br><br>${link}<br><br>`;
    const email: Email = {
      subject: 'Password reset request',
      body: body
    }
    this.sendEmail(emailAddress, email);  
  }
  
  sendEmailNotificationsSettingsUpdate(userId: string, enabled: boolean): void {
    const body = `User: ${userId} has updated the notifications settings to ${enabled}.`;
    const email: Email = {
      subject: 'Notifications settings update',
      body: body
    }
    this.sendEmail('edmond@mentorswithoutborders.net', email);  
  }
  
  async sendEmailTest(request: Request, response: Response): Promise<void> {
    const userId = request.params.user_id;
    const client = await pool.connect();   
    try {
      await client.query('BEGIN');
      const user = await users.getUserFromDB(userId, client);
      const userFirstName = helpers.getUserFirstName(user);
      let body = 'Test email';
      body = this.setEmailBody(userFirstName, body);
      const email: Email = {
        subject: 'Test',
        body: body
      }
      this.sendEmail(user?.email as string, email);
      response.status(200).json('Email was sent successfully');
      await client.query('COMMIT');      
    } catch (error) {
      response.status(400).send(error);
      await client.query('ROLLBACK');      
    } finally {
      client.release();
    }
  }  
}

