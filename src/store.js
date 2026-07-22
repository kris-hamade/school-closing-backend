const { buildClosureSnapshot, detectChanges } = require('./aggregation');

const capped = (values, limit) => values.length > limit ? values.slice(-limit) : values;

class ClosureStore {
  constructor({ schools, publicSource, matchThreshold = 85, now = () => new Date() }) {
    this.schools = schools;
    this.publicSource = publicSource;
    this.matchThreshold = matchThreshold;
    this.now = now;
    this.inFlight = null;
    this.changeHistory = { statusChanges: [], schoolsAdded: [], schoolsRemoved: [] };
    const baseline = buildClosureSnapshot(schools, [], { checkedAt: null, matchThreshold });
    this.data = {
      closures: baseline.closures,
      metadata: {
        lastUpdated: null, lastAttempt: null, dataSource: publicSource,
        totalSchools: schools.length, closedSchools: 0, fetchError: null,
        pullHistory: [], unmatchedSourceEntries: [], ambiguousSourceEntries: [],
        sourceElementCount: 0, malformedSourceEntries: []
      },
      isdStatus: baseline.isdStatus
    };
  }

  isReady() { return Boolean(this.data.metadata.lastUpdated); }
  getData() { return this.data; }
  getChangeHistory() { return this.changeHistory; }
  isRefreshing() { return Boolean(this.inFlight); }

  refresh(loader) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#performRefresh(loader).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async #performRefresh(loader) {
    const attemptAt = this.now().toISOString();
    try {
      const { entries, diagnostics = {}, schools = this.schools } = await loader();
      const prior = this.isReady() ? this.data.closures : null;
      const snapshot = buildClosureSnapshot(schools, entries, {
        checkedAt: attemptAt, previousClosures: prior, matchThreshold: this.matchThreshold
      });
      const changes = detectChanges(prior, snapshot.closures, attemptAt);
      for (const key of Object.keys(this.changeHistory)) {
        this.changeHistory[key] = capped([...this.changeHistory[key], ...changes[key]], 1000);
      }
      const history = capped([...this.data.metadata.pullHistory, {
        timestamp: attemptAt, success: true, error: null,
        totalSchools: snapshot.totalSchools, closedSchools: snapshot.closedSchools
      }], 100);
      this.schools = schools;
      this.data = {
        closures: snapshot.closures,
        metadata: {
          lastUpdated: attemptAt, lastAttempt: attemptAt, dataSource: this.publicSource,
          totalSchools: snapshot.totalSchools, closedSchools: snapshot.closedSchools,
          fetchError: null, pullHistory: history,
          unmatchedSourceEntries: snapshot.diagnostics.unmatchedSourceEntries,
          ambiguousSourceEntries: snapshot.diagnostics.ambiguousSourceEntries,
          sourceElementCount: diagnostics.sourceElementCount || 0,
          malformedSourceEntries: diagnostics.malformedEntries || []
        },
        isdStatus: snapshot.isdStatus
      };
      return this.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown refresh error';
      const history = capped([...this.data.metadata.pullHistory, {
        timestamp: attemptAt, success: false, error: message,
        totalSchools: this.data.metadata.totalSchools, closedSchools: this.data.metadata.closedSchools
      }], 100);
      this.data = { ...this.data, metadata: { ...this.data.metadata, lastAttempt: attemptAt, fetchError: message, pullHistory: history } };
      throw error;
    }
  }
}

module.exports = { ClosureStore };
