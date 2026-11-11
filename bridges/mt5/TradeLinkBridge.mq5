#property strict
#property version   "1.0"
#property description "TRADE LINK outbound MT5 account bridge"

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
   long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   string accountMode = mode == ACCOUNT_TRADE_MODE_DEMO ? "demo" : "real";
   string json = "{\"terminalVersion\":\"MT5\",\"account\":{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) +
      "\",\"mode\":\"" + accountMode + "\",\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) +
      "\",\"balance\":" + Number(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"equity\":" + Number(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
      ",\"margin\":" + Number(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",\"freeMargin\":" + Number(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) +
      ",\"leverage\":" + (string)AccountInfoInteger(ACCOUNT_LEVERAGE) + "},\"positions\":[";
   bool first = true;
   for(int i=0; i<PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      string symbol = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE positionType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      string direction = positionType == POSITION_TYPE_BUY ? "BUY" : "SELL";
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      double current = positionType == POSITION_TYPE_BUY ? SymbolInfoDouble(symbol, SYMBOL_BID) : SymbolInfoDouble(symbol, SYMBOL_ASK);
      if(!first) json += ",";
      first = false;
      json += "{\"ticket\":\"" + (string)ticket + "\",\"symbol\":\"" + symbol + "\",\"direction\":\"" + direction +
         "\",\"volume\":" + Number(PositionGetDouble(POSITION_VOLUME), 2) + ",\"entryPrice\":" + Number(PositionGetDouble(POSITION_PRICE_OPEN), digits) +
         ",\"currentPrice\":" + Number(current, digits) + ",\"stopLoss\":" + Number(PositionGetDouble(POSITION_SL), digits) +
         ",\"takeProfit\":" + Number(PositionGetDouble(POSITION_TP), digits) + ",\"swap\":" + Number(PositionGetDouble(POSITION_SWAP), 2) +
         ",\"commission\":0,\"profit\":" + Number(PositionGetDouble(POSITION_PROFIT), 2) +
         ",\"openTime\":\"" + IsoTime((datetime)PositionGetInteger(POSITION_TIME)) + "\"}";
   }
   return json + "]}";
}

bool AlreadyOpened(string commandId)
{
   for(int i=0; i<PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionSelectByTicket(ticket) && StringFind(PositionGetString(POSITION_COMMENT), commandId) == 0) return true;
   }
   return false;
}

void Acknowledge(string commandId, bool success, string resultJson)
{
   string response;
   string status = success ? "completed" : "rejected";
   Http("POST", "/api/brokers/bridge/" + AccountId + "/commands/" + commandId + "/ack",
      "{\"status\":\"" + status + "\",\"result\":" + resultJson + "}", response);
}

double SafeVolume(string symbol, double requested)
{
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double minimum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maximum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0 || requested < minimum) return 0;
   double volume = MathFloor(requested / step + 1e-8) * step;
   return NormalizeDouble(MathMin(volume, maximum), 2);
}

bool SendTrade(MqlTradeRequest &request, MqlTradeResult &result)
{
   ZeroMemory(result);
   if(!OrderSend(request, result)) return false;
   return result.retcode == TRADE_RETCODE_DONE || result.retcode == TRADE_RETCODE_DONE_PARTIAL || result.retcode == TRADE_RETCODE_PLACED;
}

ENUM_ORDER_TYPE_FILLING FillingMode(string symbol)
{
   long flags=SymbolInfoInteger(symbol,SYMBOL_FILLING_MODE);
   if((flags & SYMBOL_FILLING_IOC)==SYMBOL_FILLING_IOC) return ORDER_FILLING_IOC;
   if((flags & SYMBOL_FILLING_FOK)==SYMBOL_FILLING_FOK) return ORDER_FILLING_FOK;
   return ORDER_FILLING_RETURN;
}

void ExecuteCommand(string line)
{
   string fields[];
   int count = StringSplit(line, StringGetCharacter("|", 0), fields);
   if(count < 8) return;
   string id=fields[0], type=fields[1], symbol=fields[2], direction=fields[3];
   ulong ticket=(ulong)StringToInteger(fields[7]);
   double volume=StringToDouble(fields[4]), sl=StringToDouble(fields[5]), tp=StringToDouble(fields[6]);
   MqlTradeRequest request; MqlTradeResult result; ZeroMemory(request);
   if(type == "open")
   {
      if(AlreadyOpened(id)) { Acknowledge(id, true, "{\"orderId\":\"existing\",\"positionId\":\"existing\",\"price\":0,\"volume\":"+Number(volume,2)+"}"); return; }
      double lots = SafeVolume(symbol, volume);
      if(lots <= 0) { Acknowledge(id, false, "{\"message\":\"Volume is below broker minimum\"}"); return; }
      ENUM_ORDER_TYPE orderType = direction == "BUY" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      request.action=TRADE_ACTION_DEAL; request.symbol=symbol; request.type=orderType; request.volume=lots;
      request.price=direction == "BUY" ? SymbolInfoDouble(symbol, SYMBOL_ASK) : SymbolInfoDouble(symbol, SYMBOL_BID);
      request.sl=sl; request.tp=tp; request.deviation=MaxSlippagePoints; request.comment=id;
      request.type_filling=FillingMode(symbol);
      if(!SendTrade(request, result)) { Acknowledge(id, false, "{\"message\":\"Market order rejected\",\"code\":"+(string)result.retcode+"}"); return; }
      Acknowledge(id, true, "{\"orderId\":\""+(string)result.order+"\",\"positionId\":\""+(string)(result.order>0?result.order:result.deal)+"\",\"price\":"+Number(result.price,digits)+",\"volume\":"+Number(result.volume>0?result.volume:lots,2)+"}");
      return;
   }
   if(!PositionSelectByTicket(ticket)) { Acknowledge(id, false, "{\"message\":\"Position ticket not found\"}"); return; }
   string positionSymbol=PositionGetString(POSITION_SYMBOL);
   ENUM_POSITION_TYPE positionType=(ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
   int digits=(int)SymbolInfoInteger(positionSymbol,SYMBOL_DIGITS);
   if(type == "close")
   {
      double total=PositionGetDouble(POSITION_VOLUME);
      double closeVolume=volume>0?SafeVolume(positionSymbol,volume):total;
      if(closeVolume<=0 || closeVolume>total) { Acknowledge(id,false,"{\"message\":\"Invalid close volume\"}"); return; }
      request.action=TRADE_ACTION_DEAL; request.position=ticket; request.symbol=positionSymbol; request.volume=closeVolume; request.deviation=MaxSlippagePoints;
      request.type=positionType==POSITION_TYPE_BUY?ORDER_TYPE_SELL:ORDER_TYPE_BUY;
      request.price=request.type==ORDER_TYPE_BUY?SymbolInfoDouble(positionSymbol,SYMBOL_ASK):SymbolInfoDouble(positionSymbol,SYMBOL_BID);
      double oldProfit=PositionGetDouble(POSITION_PROFIT);
      request.type_filling=FillingMode(positionSymbol);
      if(!SendTrade(request,result)) { Acknowledge(id,false,"{\"message\":\"Position close rejected\",\"code\":"+(string)result.retcode+"}"); return; }
      Acknowledge(id,true,"{\"orderId\":\""+(string)result.order+"\",\"volume\":"+Number(result.volume>0?result.volume:closeVolume,2)+",\"price\":"+Number(result.price,digits)+",\"profit\":"+Number(oldProfit,2)+"}");
      return;
   }
   if(type == "modify")
   {
      request.action=TRADE_ACTION_SLTP; request.position=ticket; request.symbol=positionSymbol; request.sl=sl; request.tp=tp;
      if(!SendTrade(request,result)) { Acknowledge(id,false,"{\"message\":\"Position modify rejected\",\"code\":"+(string)result.retcode+"}"); return; }
      Acknowledge(id,true,"{\"orderId\":\""+(string)ticket+"\"}");
   }
}

void OnTimer()
{
   string response;
   Http("POST", "/api/brokers/bridge/" + AccountId + "/heartbeat", Snapshot(), response);
   if(!Http("GET", "/api/brokers/bridge/" + AccountId + "/commands", "", response)) return;
   StringReplace(response,"\r","");
   string lines[]; int count=StringSplit(response,StringGetCharacter("\n",0),lines);
   for(int i=0;i<count;i++) if(StringLen(lines[i])>5) ExecuteCommand(lines[i]);
}

int OnInit()
{
   if(StringLen(AccountId)<1 || StringLen(BridgeSecret)<32 || StringFind(AppBaseUrl,"https://")!=0)
   { Print("Set AccountId, BridgeSecret and HTTPS AppBaseUrl in the EA inputs."); return INIT_PARAMETERS_INCORRECT; }
   EventSetTimer(MathMax(1,PollSeconds));
   Print("TRADE LINK MT5 bridge started. Add this host to Tools > Options > Expert Advisors > WebRequest allowlist.");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}
