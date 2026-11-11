#property strict
#property version   "1.0"
#property description "TRADE LINK outbound MT4 account bridge"

input string AppBaseUrl = "https://your-tradelink-host";
input string AccountId = "";
input string BridgeSecret = "";
input int PollSeconds = 2;
input int MaxSlippagePoints = 30;

string Headers() { return "Authorization: Bearer " + BridgeSecret + "\r\nContent-Type: application/json\r\n"; }

bool Http(string method, string path, string body, string &response)
{
   char data[], result[];
   string responseHeaders;
   int count = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(count > 0) ArrayResize(data, count - 1);
   ResetLastError();
   int status = WebRequest(method, AppBaseUrl + path, Headers(), 5000, data, result, responseHeaders);
   if(status < 200 || status >= 300)
   {
      Print("TRADE LINK bridge HTTP ", status, " error=", GetLastError(), " path=", path);
      response = "";
      return false;
   }
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   return true;
}

string Number(double value, int digits=8) { return DoubleToString(value, digits); }
string IsoTime(datetime value) { return TimeToString(value, TIME_DATE|TIME_SECONDS); }

string Snapshot()
{
   int mode = (int)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   string accountMode = mode == ACCOUNT_TRADE_MODE_DEMO ? "demo" : "real";
   string json = "{\"terminalVersion\":\"MT4\",\"account\":{\"login\":\"" + IntegerToString(AccountNumber()) +
      "\",\"mode\":\"" + accountMode + "\",\"currency\":\"" + AccountCurrency() +
      "\",\"balance\":" + Number(AccountBalance(), 2) + ",\"equity\":" + Number(AccountEquity(), 2) +
      ",\"margin\":" + Number(AccountMargin(), 2) + ",\"freeMargin\":" + Number(AccountFreeMargin(), 2) +
      ",\"leverage\":" + IntegerToString(AccountLeverage()) + "},\"positions\":[";
   bool first = true;
   for(int i=0; i<OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      if(!first) json += ",";
      first = false;
      string direction = OrderType() == OP_BUY ? "BUY" : "SELL";
      double current = direction == "BUY" ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
      json += "{\"ticket\":\"" + IntegerToString(OrderTicket()) + "\",\"symbol\":\"" + OrderSymbol() +
         "\",\"direction\":\"" + direction + "\",\"volume\":" + Number(OrderLots(), 2) +
         ",\"entryPrice\":" + Number(OrderOpenPrice(), Digits) + ",\"currentPrice\":" + Number(current, Digits) +
         ",\"stopLoss\":" + Number(OrderStopLoss(), Digits) + ",\"takeProfit\":" + Number(OrderTakeProfit(), Digits) +
         ",\"swap\":" + Number(OrderSwap(), 2) + ",\"commission\":" + Number(OrderCommission(), 2) +
         ",\"profit\":" + Number(OrderProfit(), 2) + ",\"openTime\":\"" + IsoTime(OrderOpenTime()) + "\"}";
   }
   return json + "]}";
}

bool AlreadyOpened(string commandId)
{
   for(int i=0; i<OrdersTotal(); i++)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES) && StringFind(OrderComment(), commandId) == 0) return true;
   return false;
}

void Acknowledge(string commandId, bool success, string resultJson)
{
   string response;
   string status = success ? "completed" : "rejected";
   string body = "{\"status\":\"" + status + "\",\"result\":" + resultJson + "}";
   Http("POST", "/api/brokers/bridge/" + AccountId + "/commands/" + commandId + "/ack", body, response);
}

double SafeLots(string symbol, double requested)
{
   double step = MarketInfo(symbol, MODE_LOTSTEP);
   double minLot = MarketInfo(symbol, MODE_MINLOT);
   double maxLot = MarketInfo(symbol, MODE_MAXLOT);
   if(step <= 0 || requested < minLot) return 0;
   double lots = MathFloor(requested / step + 1e-8) * step;
   return NormalizeDouble(MathMin(lots, maxLot), 2);
}

void ExecuteCommand(string line)
{
   string fields[];
   ushort separator = StringGetCharacter("|", 0);
   int count = StringSplit(line, separator, fields);
   if(count < 8) return;
   string id=fields[0], type=fields[1], symbol=fields[2], direction=fields[3];
   int ticket=(int)StringToInteger(fields[7]);
   double volume=StringToDouble(fields[4]), sl=StringToDouble(fields[5]), tp=StringToDouble(fields[6]);
   if(type == "open")
   {
      if(AlreadyOpened(id)) { Acknowledge(id, true, "{\"orderId\":\"existing\",\"positionId\":\"existing\",\"price\":0,\"volume\":"+Number(volume,2)+"}"); return; }
      int cmd = direction == "BUY" ? OP_BUY : OP_SELL;
      double lots = SafeLots(symbol, volume);
      if(lots <= 0) { Acknowledge(id, false, "{\"message\":\"Volume is below broker minimum\"}"); return; }
      RefreshRates();
      double price = cmd == OP_BUY ? MarketInfo(symbol, MODE_ASK) : MarketInfo(symbol, MODE_BID);
      int order = OrderSend(symbol, cmd, lots, price, MaxSlippagePoints, sl, tp, id, 0, 0, clrNONE);
      if(order < 0) { int err=GetLastError(); Acknowledge(id, false, "{\"message\":\"OrderSend rejected\",\"code\":"+IntegerToString(err)+"}"); return; }
      double fill = price;
      if(OrderSelect(order, SELECT_BY_TICKET)) fill = OrderOpenPrice();
      Acknowledge(id, true, "{\"orderId\":\""+IntegerToString(order)+"\",\"positionId\":\""+IntegerToString(order)+"\",\"price\":"+Number(fill,Digits)+",\"volume\":"+Number(lots,2)+"}");
      return;
   }
   if(!OrderSelect(ticket, SELECT_BY_TICKET)) { Acknowledge(id, false, "{\"message\":\"Position ticket not found\"}"); return; }
   if(type == "close")
   {
      double closeLots = volume > 0 ? SafeLots(OrderSymbol(), volume) : OrderLots();
      if(closeLots <= 0 || closeLots > OrderLots()) { Acknowledge(id, false, "{\"message\":\"Invalid close volume\"}"); return; }
      RefreshRates();
      double closePrice = OrderType() == OP_BUY ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
      double oldProfit = OrderProfit() + OrderSwap() + OrderCommission();
      if(!OrderClose(ticket, closeLots, closePrice, MaxSlippagePoints, clrNONE)) { int err=GetLastError(); Acknowledge(id, false, "{\"message\":\"OrderClose rejected\",\"code\":"+IntegerToString(err)+"}"); return; }
      Acknowledge(id, true, "{\"orderId\":\""+IntegerToString(ticket)+"\",\"volume\":"+Number(closeLots,2)+",\"price\":"+Number(closePrice,Digits)+",\"profit\":"+Number(oldProfit,2)+"}");
      return;
   }
   if(type == "modify")
   {
      if(!OrderModify(ticket, OrderOpenPrice(), sl, tp, OrderExpiration(), clrNONE)) { int err=GetLastError(); Acknowledge(id, false, "{\"message\":\"OrderModify rejected\",\"code\":"+IntegerToString(err)+"}"); return; }
      Acknowledge(id, true, "{\"orderId\":\""+IntegerToString(ticket)+"\"}");
   }
}

void OnTimer()
{
   string response;
   Http("POST", "/api/brokers/bridge/" + AccountId + "/heartbeat", Snapshot(), response);
   if(!Http("GET", "/api/brokers/bridge/" + AccountId + "/commands", "", response)) return;
   string lines[];
   ushort newline = StringGetCharacter("\n", 0);
   int count = StringSplit(response, newline, lines);
   for(int i=0; i<count; i++) if(StringLen(lines[i]) > 5) ExecuteCommand(lines[i]);
}

int OnInit()
{
   if(StringLen(AccountId) < 1 || StringLen(BridgeSecret) < 32 || StringFind(AppBaseUrl, "https://") != 0)
   { Print("Set AccountId, BridgeSecret and HTTPS AppBaseUrl in the EA inputs."); return INIT_PARAMETERS_INCORRECT; }
   EventSetTimer(MathMax(1, PollSeconds));
   Print("TRADE LINK MT4 bridge started. Add this host to Tools > Options > Expert Advisors > WebRequest allowlist.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}
