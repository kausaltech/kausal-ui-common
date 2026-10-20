import { makeInstanceFormatter } from '../numbers';

describe('makeInstanceFormatter', () => {
  const format = (...args: Parameters<typeof makeInstanceFormatter>) =>
    makeInstanceFormatter(...args).format(1234.567);

  it('falls back to two significant digits', () => {
    expect(format('en', null)).toBe('1,200');
  });

  it("falls back to the app's default when given", () => {
    expect(format('en', null, 3)).toBe('1,230');
  });

  it("uses the instance's settings over any default", () => {
    expect(format('en', { showSignificantDigits: 4 }, 3)).toBe('1,235');
    expect(format('en', { maximumFractionDigits: 1 }, 3)).toBe('1,234.6');
  });
});
