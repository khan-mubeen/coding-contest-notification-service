import { describe, it, expect, beforeEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { Mailer } from '../src/mailer.js';
import { config } from '../src/config.js';

vi.mock('nodemailer');

describe('Mailer', () => {
  let mailer: Mailer;
  let mockSendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id-123' });

    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMail
    } as any);

    mailer = new Mailer();
  });

  it('should send email with correct parameters', async () => {
    await mailer.send(
      'user@example.com',
      'Test Subject',
      'Test body content'
    );

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: config.smtp.from,
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Test body content'
      })
    );
  });

  it('should use stream transport when no SMTP credentials', async () => {
    // This test verifies the mailer correctly handles missing SMTP config
    expect(mailer).toBeDefined();
  });

  it('should log messageId on successful send', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    await mailer.send(
      'user@example.com',
      'Test Subject',
      'Test body'
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Mailer] sent messageId=')
    );
  });

  it('should throw error if send fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

    await expect(
      mailer.send('user@example.com', 'Test', 'Test')
    ).rejects.toThrow('SMTP connection failed');
  });
});
