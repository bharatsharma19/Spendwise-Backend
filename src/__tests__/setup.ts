// Mock Firebase Admin
const mockDate = new Date('2023-01-01');

class MockTimestamp {
  constructor(private date: Date) {}

  toDate() {
    return this.date;
  }

  static now() {
    return new MockTimestamp(mockDate);
  }

  static fromDate(date: Date) {
    return new MockTimestamp(date);
  }
}

// Mocks removed to rely on internal test logic in config files

// Global Jest setup
beforeAll(() => {
  // Add any global setup here
});

afterAll(() => {
  // Add any global cleanup here
});
