import { Injectable, Logger } from '@nestjs/common';
import { MailerService as MailService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailService) {}

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        sender: 'Leyu',
        to,
        subject,
        html: body,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }

  async sendLeyuAccountEmail(
    to: string,
    role: string,
    phoneNumber: string,
    tempPassword: string,
    dashboardUrl: string,
  ) {
    try {
      await this.mailerService.sendMail({
        sender: 'Leyu',
        to,
        subject: 'Your Leyu Platform Account Has Been Created',
        html: `
          <p>Your account for the Leyu Platform has been successfully created and assigned to the <b>${role}</b> role.</p>

          <p>Please use the following temporary credentials to access your account:</p>
          <ul>
            <li><b>Username (Phone Number):</b> ${to || phoneNumber}</li>
            <li><b>System-Generated Password:</b> ${tempPassword}</li>
          </ul>

          <h3>Access Your Dashboard</h3>
          <p>You can access your account via the dashboard link below:</p>
          <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>

          <h3>Getting Started</h3>
          <ul>
            <li><b>Initial Log In:</b> Open the dashboard link above and sign in using your credentials.</li>
            <li><b>Change Your Password:</b> For your security, you are required to change this system-generated password immediately after your first login.</li>
            <li><b>Profile Completion:</b> Ensure your full name and profile details are accurate in your account settings.</li>
            <li><b>Dashboard Access:</b> You can now begin managing tasks, teams, or system data based on your <b>${role}</b> permissions.</li>
          </ul>
        `,
        text: `
Your Leyu Platform account has been created with the role: ${role}.

Username: ${phoneNumber}
Temporary Password: ${tempPassword}

Access your dashboard:
${dashboardUrl}

Please log in and change your password immediately.
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send account creation email to ${to}: ${error.message}`);
    }
  }
}
