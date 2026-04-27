from fastapi import APIRouter
from app.schemas.strategy import StrategyRequest, StrategyResponse, DRScoreOut, EnergyParamsOut, HourlyDataOut, KPIsOut
from app.core.strategy_engine import compute_dr_scores, Scenario

router = APIRouter()


@router.post("/optimize", response_model=StrategyResponse)
async def optimize_strategy(req: StrategyRequest) -> StrategyResponse:
    scenario = Scenario(
        id=req.scenario.id,
        label=req.scenario.label,
        load_profile=req.scenario.load_profile,
        peak_kw=req.scenario.peak_kw,
        existing_gen_kw=req.scenario.existing_gen_kw,
        gen_paralleled=req.scenario.gen_paralleled,
        existing_solar_kw=req.scenario.existing_solar_kw or 0.0,
    )

    scores = await compute_dr_scores(req.objective, scenario)

    scores_out: list[DRScoreOut] = []
    for s in scores:
        scores_out.append(DRScoreOut(
            dr_id=s.dr.id,
            dr_label=s.dr.label,
            dr_label_sub=s.dr.label_sub,
            dr_start=s.dr.start,
            dr_end=s.dr.end,
            rate_multiplier=s.dr.rate_multiplier,
            events_per_year=s.dr.events_per_year,
            score=s.score,
            value_label=s.value_label,
            load_pct=s.load_pct,
            params=EnergyParamsOut(
                self_solar=s.params.self_solar,
                solar_ppa=s.params.solar_ppa,
                wind_ppa=s.params.wind_ppa,
                hydro_ppa=s.params.hydro_ppa,
                natgas=s.params.natgas,
                sofc=s.params.sofc,
                bess=s.params.bess,
            ),
            hourly_data=[
                HourlyDataOut(
                    hour=d.hour,
                    existing_gen=d.existing_gen,
                    existing_solar=d.existing_solar,
                    bess=d.bess,
                    self_solar=d.self_solar,
                    solar_ppa=d.solar_ppa,
                    wind_ppa=d.wind_ppa,
                    hydro_ppa=d.hydro_ppa,
                    sofc=d.sofc,
                    natgas=d.natgas,
                    grid=d.grid,
                )
                for d in s.hourly_data
            ],
            kpis=KPIsOut(
                capex=s.kpis.capex,
                dr_revenue=s.kpis.dr_revenue,
                cfe_rate=s.kpis.cfe_rate,
                carbon=s.kpis.carbon,
            ),
            ai_text=s.ai_text,
        ))

    return StrategyResponse(
        scores=scores_out,
        objective=req.objective,
        scenario_id=req.scenario.id,
    )
