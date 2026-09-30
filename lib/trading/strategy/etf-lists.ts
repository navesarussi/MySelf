/** The ETF lists the book's ETF sleeves trade (pure — shared with the app for the "move to strategy" menu). */

/** Broad equity index, sector and country ETFs — where short-term mean reversion held from 2007 to 2026. */
export const EQUITY_ETFS: ReadonlySet<string> = new Set(
  "SPY,QQQ,IWM,DIA,MDY,RSP,XLB,XLE,XLF,XLI,XLK,XLP,XLU,XLV,XLY,SMH,SOXX,IBB,XBI,KRE,XRT,XHB,ITB,IGV,EFA,EEM,VGK,EWJ,EWG,EWU,EWC,EWA,EWZ,EWY,EWT,EWW,FXI,INDA,VNQ,IYR,IJR,IWF,IWD,VTV,VUG,MTUM,QUAL,USMV".split(",")
);

/** Cross-asset ETFs: US/international equity, real estate, Treasuries, credit, TIPS, gold, commodities. */
export const ROTATION_ETFS: ReadonlySet<string> = new Set("SPY,QQQ,IWM,EFA,EEM,VNQ,TLT,IEF,LQD,HYG,TIP,GLD,DBC".split(","));
