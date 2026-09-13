// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] SOP 자동생성(LLM) — 컨트롤러 진입점
//  원본: protectofoundationservice/Controllers/SOP/Edit/SopManageController.cs
//  발췌 범위: L1~30 (using/클래스 선언/DI), L404~427 (GetLLMSopFlowChart 액션)
// ═════════════════════════════════════════════════════════════════════════════

﻿using Microsoft.AspNetCore.Mvc;
using System.Net.Mime;
using Une.Protecto.FoundationService.Attributes;
using Une.Protecto.FoundationService.Exceptions;
using Une.Protecto.FoundationService.Models;
using Une.Protecto.FoundationService.Models.Details;
using Une.Protecto.FoundationService.Models.Requests;
using Une.Protecto.FoundationService.Models.Responses;
using Une.Protecto.FoundationService.Services.SOP.Edit;
using Une.Protecto.FoundationService.Utilities;
using Microsoft.AspNetCore.Authorization;


namespace Une.Protecto.FoundationService.Controllers.SOP.Edit
{
    /// <summary>
    /// SOP 관리
    /// </summary>
    [DeclareActionGroup("SopManage", "SOP 편집 관리")]
    [Route("api/sop/manage")]
    [ApiController]
    [Swashbuckle.AspNetCore.Annotations.SwaggerTag("SOP 편집/SOP 관리")]
    public class SopManageController : ProtectoController
    {
        private readonly ISopEditService _sopEditService;

        public SopManageController(ISopEditService sopEditService)
        {
            _sopEditService = sopEditService;
        }

        // ────────────────────────────────────────────────────────────────────
        // ... 중략: SOP 목록/상세 조회, FlowChart 저장, JSON Import·Export 등
        //          기존 SOP 편집 액션 (본 기능과 무관) ...
        // ────────────────────────────────────────────────────────────────────

        /// <summary>
        /// [FUN-PROT-274003]
        /// LLM SOP Flow Chart 생성 요청.
        /// </summary>
        /// <param name="query">사용자 자연어 쿼리</param>
        /// <returns>처리 시작 결과 (Success/GroupNm/ResultMessage)</returns>
        [HttpPost("llmflowchart")]
        [DeclareAction("GetLLMFlowChart", "LLM SOP Flow Chart 생성 요청", true)]
        [Consumes(typeof(string), MediaTypeNames.Application.Json)]
        [ProducesResponseType(typeof(LLMSopFlowChartResponse), StatusCodes.Status200OK, MediaTypeNames.Application.Json)]
        [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest, MediaTypeNames.Application.Json)]
        public async Task<ActionResult<LLMSopFlowChartResponse>> GetLLMSopFlowChart([FromBody] string query)
        {
            try
            {
                var response = await _sopEditService.GetLLMSopFlowChartAsync(query);
                return Ok(response);
            }
            catch (Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }
    }
}
