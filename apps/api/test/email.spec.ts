import { EmailService } from '../src/email/email.service';
import { LogEmailProvider } from '../src/email/log-email.provider';

/**
 * Sending email.
 *
 * The cases here are all about what happens when it goes wrong, because that is the part
 * with consequences. A password reset that could not be emailed must leave the request
 * succeeding and the token valid — a 500 tells the user their account is broken when it is
 * the mail provider that is down.
 */
describe('EmailService', () => {
  const message = { to: 'ravi@example.com', subject: 'Reset your password', text: 'link' };

  function build(provider: { name: string; send: jest.Mock }) {
    return { service: new EmailService(provider as never), provider };
  }

  it('reports a successful send', async () => {
    const { service } = build({
      name: 'brevo',
      send: jest.fn().mockResolvedValue({ messageId: 'abc' }),
    });

    await expect(service.send(message)).resolves.toBe(true);
  });

  it('does not throw when the provider fails', async () => {
    const { service } = build({
      name: 'brevo',
      send: jest.fn().mockRejectedValue(new Error('HTTP 401')),
    });

    // The caller's own work already succeeded. Failing it now because mail is down would
    // tell the user their account is broken when it is not.
    await expect(service.send(message)).resolves.toBe(false);
  });

  it('reports false when nothing was actually sent', async () => {
    const { service } = build({
      name: 'log',
      send: jest.fn().mockResolvedValue({ messageId: 'not-sent', skipped: true }),
    });

    await expect(service.send(message)).resolves.toBe(false);
  });

  it('never writes the body to a log', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { service } = build({
      name: 'brevo',
      send: jest.fn().mockRejectedValue(new Error('HTTP 500')),
    });
    await service.send({ ...message, text: 'https://locz.in/reset?token=SECRET-TOKEN' });

    // A reset link in a log file is a credential in a log file, and log files are copied,
    // shipped and retained far beyond where anyone intends.
    const written = [...warn.mock.calls, ...log.mock.calls, ...error.mock.calls].flat().join(' ');
    expect(written).not.toContain('SECRET-TOKEN');

    warn.mockRestore();
    log.mockRestore();
    error.mockRestore();
  });

  it('masks the recipient rather than logging it whole', async () => {
    const { service } = build({
      name: 'brevo',
      send: jest.fn().mockRejectedValue(new Error('HTTP 500')),
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.send(message);

    // Enough to recognise the address in a support conversation, not enough to harvest it.
    const written = error.mock.calls.flat().join(' ');
    expect(written).not.toContain('ravi@example.com');
    error.mockRestore();
  });
});

describe('LogEmailProvider', () => {
  it('sends nothing and says so', async () => {
    const provider = new LogEmailProvider();

    // Development, tests and a key-less deployment all have to work. An API whose main job
    // has nothing to do with email must not fail because a mail key is absent.
    await expect(provider.send({ to: 'a@b.com', subject: 's', text: 't' })).resolves.toEqual({
      messageId: 'not-sent',
      skipped: true,
    });
  });
});
