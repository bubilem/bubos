export default {
  async run(ctx) {
    for (const a of ctx.args) { delete ctx.sh.vars[a]; ctx.sh.exported.delete(a); }
  },
};
