import { Type } from "@google/genai";
import {
  Env,
  jsonResponse,
  getGeminiClient,
  sanitizePromptInput,
  generateContentWithRetry,
  cleanAndParseJson
} from "../lib/helpers";

export const onRequestOptions = async () => {
  return jsonResponse({}, 200);
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    let body: any = {};
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request body." }, 400);
    }

    const { intake, rawDescription } = body;

    if (!rawDescription || typeof rawDescription !== "string") {
      return jsonResponse({ error: "Raw case description text is required for analysis." }, 400);
    }

    if (rawDescription.trim().length < 10) {
      return jsonResponse({ error: "Case description must be at least 10 characters long." }, 400);
    }

    if (rawDescription.length > 20000) {
      return jsonResponse({ error: "Case description exceeds maximum length limit of 20,000 characters." }, 400);
    }

    const workspace = intake?.workspace || "Citizen360";
    const subWorkspace = intake?.subWorkspace || "Property360";
    const module = intake?.module || "Registration";
    const engine = intake?.engine || "CaseClassificationAI";

    const safeIntake = {
      workspace: String(workspace).slice(0, 50),
      subWorkspace: String(subWorkspace).slice(0, 50),
      module: String(module).slice(0, 50),
      engine: String(engine).slice(0, 50),
      clientName: String(intake?.clientName || "Unknown").slice(0, 100),
      mobile: String(intake?.mobile || "Unknown").slice(0, 20),
      surveyNumber: String(intake?.surveyNumber || "N/A").slice(0, 100),
      village: String(intake?.village || "N/A").slice(0, 100),
      taluk: String(intake?.taluk || "N/A").slice(0, 100),
      district: String(intake?.district || "Madurai").slice(0, 100),
      oppositeParty: String(intake?.oppositeParty || "Opposite Party").slice(0, 100),
      partyRelationship: String(intake?.partyRelationship || "Disputing Parties").slice(0, 100),
      courtOrForum: String(intake?.courtOrForum || "Jurisdictional Authority / Court").slice(0, 100),
      existingAdvocate: String(intake?.existingAdvocate || "No").slice(0, 50),
      existingCaseNumber: String(intake?.existingCaseNumber || "None").slice(0, 100),
      limitationRisk: String(intake?.limitationRisk || "No").slice(0, 50),
    };

    const safeNarrative = sanitizePromptInput(rawDescription.slice(0, 20000));
    const ai = getGeminiClient(context.env);

    let prompt = "";
    if (safeIntake.module === "Consumer360") {
      prompt = `
You are the Master Legal AI Engine for the UNIKORN360 – CONSUMER360 CASE SOLVING FRAMEWORK v2.0.
Your mandate is to answer one central question:
"Has a consumer suffered because a product or service provider failed in their legal duty, and what is the fastest way to obtain compensation or corrective relief?"

### CLIENT INTAKE DETAILS (Stage 0):
- SubWorkspace: Consumer360 (Citizen360)
- Module: Consumer360
- AI Engine / Agent: ${safeIntake.engine || "ProductDefectAI"}
- Client / Consumer Name: ${safeIntake.clientName}
- Mobile: ${safeIntake.mobile}
- Location / District: ${safeIntake.district}
- Consumer Forum / Authority: ${safeIntake.courtOrForum}
- Opposite Party (Seller/Manufacturer/Provider): ${safeIntake.oppositeParty}
- Party Relationship Context: ${safeIntake.partyRelationship}
- Existing Advocate / Case: ${safeIntake.existingAdvocate} (${safeIntake.existingCaseNumber})
- Limitation / Urgency Risk?: ${safeIntake.limitationRisk}

### RAW CONSUMER DISPUTE NARRATIVE:
"${safeNarrative}"

---

### UNIKORN360 CONSUMER360 12-STAGE CASE SOLVING FRAMEWORK:

STAGE 1. Case Classification -> Identify Consumer Category.
STAGE 2. Core Consumer Issue -> Identify Root Issue.
STAGE 3. Consumer Relationship -> Map relationships between Consumer and Seller/Manufacturer.
STAGE 4. Transaction Timeline -> Chronological sequence.
STAGE 5. Rights Violated -> Evaluate Rights & Statutory Violations.
STAGE 6. Evidence Assessment -> Audit available proof & Evidence Strength Rating.
STAGE 7. Proper Forum Recommendation -> Determine proper forum.
STAGE 8. Resolution Strategy -> Recommend remedies.
STAGE 9. Risk & Urgency Rating -> Rate Limitation, Warranty expiry, etc.
STAGE 10. Deliverables -> Generate Consumer Case Summary & Action Plan.
STAGE 11. Consumer Precedent Intelligence -> Search & analyze rulings.
STAGE 12. Client Resolution Report -> Plain language breakdown.

FINAL REPORT OUTPUTS REQUIRED:
A. Internal Legal Analysis (Stages 1 through 12)
B. Client-Facing Explanation
C. Documents Required
D. Immediate Actions
E. Service Package
F. Custom Document Draft
`;
    } else if (safeIntake.subWorkspace === "Legal360") {
      prompt = `
You are the Master Legal AI Engine for the UNIKORN360 LEGAL CASE SOLUTION FRAMEWORK v2.0.
Perform a problem-solving centered legal analysis for the specified legal module: "${safeIntake.module}".

### CLIENT INTAKE DETAILS (Stage 0):
- SubWorkspace: Legal360 (Citizen360)
- Module: ${safeIntake.module}
- AI Engine / Agent: ${safeIntake.engine}
- Client / Complainant Name: ${safeIntake.clientName}
- Mobile: ${safeIntake.mobile}
- Location / District: ${safeIntake.district}
- Forum / Jurisdiction Authority: ${safeIntake.courtOrForum}
- Opposite Party: ${safeIntake.oppositeParty}
- Party Relationship Context: ${safeIntake.partyRelationship}
- Existing Advocate / Proceedings?: ${safeIntake.existingAdvocate} (${safeIntake.existingCaseNumber})
- Limitation / Urgency Risk?: ${safeIntake.limitationRisk}

### RAW CLIENT CASE NARRATIVE:
"${safeNarrative}"

---

### UNIKORN360 LEGAL CASE SOLUTION FRAMEWORK (10 STAGES):
1. STAGE 1. Case Classification
2. STAGE 2. Core Legal Problem
3. STAGE 3. Parties & Relationship
4. STAGE 4. Cause of Action
5. STAGE 5. Rights & Liabilities
6. STAGE 6. Evidence Assessment
7. STAGE 7. Legal Route
8. STAGE 8. Remedy Strategy
9. STAGE 9. Risk & Urgency Analysis
10. STAGE 10. Deliverables & Execution
11. STAGE 11. Precedent Intelligence Framework
12. STAGE 12. Strategy & Outcome Simulator

FINAL REPORT OUTPUTS REQUIRED:
A. Internal Legal Analysis (Stages 1 through 12)
B. Client-Facing Explanation
C. Documents Required
D. Immediate Actions
E. Service Package
F. Custom Document Draft
`;
    } else {
      prompt = `
You are the AI Orchestration Engine for the UNIKORN360 PROPERTY & LAND REVENUE CASE SOLVING SYSTEM.
Analyze the following raw property dispute from Tamil Nadu using the UNIKORN360 PROPERTY CASE SOLVING FRAMEWORK v2.0 with STAGE 11 PRECEDENT INTELLIGENCE & STAGE 12 STRATEGY SIMULATOR.

### CLIENT INTAKE DETAILS (Stage 0):
- Client Name: ${safeIntake.clientName}
- Mobile: ${safeIntake.mobile}
- Survey Number: ${safeIntake.surveyNumber}
- Village: ${safeIntake.village}
- Taluk: ${safeIntake.taluk}
- District: ${safeIntake.district}
- Opposite Party: ${safeIntake.oppositeParty}
- Existing Advocate?: ${safeIntake.existingAdvocate}
- Existing Case Number?: ${safeIntake.existingCaseNumber}
- Limitation Risk?: ${safeIntake.limitationRisk}

### RAW CLIENT CASE NARRATIVE:
"${safeNarrative}"

---

### INSTRUCTIONS:
Perform a deep and meticulous legal and administrative analysis based on Tamil Nadu property laws (including Patta mutation, SRO registration rules, Section 77A of Registration Act for fraudulent documents, UDR/FMB errors, and Civil Court remedies) including Stage 11 Precedent Intelligence and Stage 12 Strategy & Outcome Simulator.
`;
    }

    const systemInstruction = `
You are the Senior Legal Counsel and Master Case Solution Engine of Unikorn360, expert across Indian & Tamil Nadu legal practice areas (Civil, Criminal, Family, Consumer, Labour, Tax, Corporate, Cyber, Constitutional, and Land Revenue).
Analyze cases strictly using the 12-stage framework including Precedent Intelligence and Strategy Simulation.
Always respond in valid, clean JSON according to the schema provided.
Ensure the analysis is highly customized, actionable, and legally sound.

GOVERNMENT ORDERS & CIRCULARS ACCURACY MANDATE:
When identifying Government Orders (G.O.) or Circulars in Stage 11, list ONLY actual, verified records in 'governmentOrders' and 'circulars' arrays. Do not invent fake order numbers or fabricated counts. 'governmentOrdersCount' and 'circularsCount' must strictly equal the exact length of these arrays.

CRITICAL LANGUAGE MANDATE:
Since this platform serves clients and advocates across Tamil Nadu and South India, generate ALL user-facing analysis descriptions, legal positions, risk factor lists, client replies, action items, precedent summaries, court reasoning, strategy recommendations, and package descriptions in formal, clear, and professional Tamil (தமிழ்). Keep only the JSON keys in English as specified by the schema.
    `;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "stage0", "stage1", "stage2", "stage3", "stage4", "stage5",
            "stage6", "stage7", "stage8", "stage9", "stage10", "stage11", "stage12",
            "clientFacingReply", "documentsRequired", "immediateAction",
            "servicePackage", "customDocumentDraft"
          ],
          properties: {
            stage0: {
              type: Type.OBJECT,
              properties: {
                workspace: { type: Type.STRING },
                subWorkspace: { type: Type.STRING },
                module: { type: Type.STRING },
                engine: { type: Type.STRING },
                clientName: { type: Type.STRING },
                mobile: { type: Type.STRING },
                surveyNumber: { type: Type.STRING },
                village: { type: Type.STRING },
                taluk: { type: Type.STRING },
                district: { type: Type.STRING },
                oppositeParty: { type: Type.STRING },
                partyRelationship: { type: Type.STRING },
                courtOrForum: { type: Type.STRING },
                existingAdvocate: { type: Type.STRING },
                existingCaseNumber: { type: Type.STRING },
                limitationRisk: { type: Type.STRING }
              }
            },
            stage1: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                specificType: { type: Type.STRING }
              }
            },
            stage2: {
              type: Type.OBJECT,
              properties: {
                realIssue: { type: Type.STRING },
                rootCauseStatement: { type: Type.STRING }
              }
            },
            stage3: {
              type: Type.OBJECT,
              properties: {
                subjectType: { type: Type.STRING },
                partyRelationshipMap: { type: Type.STRING }
              }
            },
            stage4: {
              type: Type.OBJECT,
              properties: {
                timelineEvents: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            },
            stage5: {
              type: Type.OBJECT,
              properties: {
                rightsViolated: { type: Type.ARRAY, items: { type: Type.STRING } },
                dutiesBreached: { type: Type.ARRAY, items: { type: Type.STRING } },
                legalObligations: { type: Type.ARRAY, items: { type: Type.STRING } },
                possibleLiabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                availableProtections: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            stage6: {
              type: Type.OBJECT,
              properties: {
                available: { type: Type.ARRAY, items: { type: Type.STRING } },
                missing: { type: Type.ARRAY, items: { type: Type.STRING } },
                documentary: { type: Type.ARRAY, items: { type: Type.STRING } },
                electronic: { type: Type.ARRAY, items: { type: Type.STRING } },
                witnesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                officialRecords: { type: Type.ARRAY, items: { type: Type.STRING } },
                evidenceStrength: { type: Type.STRING }
              }
            },
            stage7: {
              type: Type.OBJECT,
              properties: {
                route: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                primaryAuthority: { type: Type.STRING },
                appellateAuthority: { type: Type.STRING },
                forumType: { type: Type.STRING }
              }
            },
            stage8: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                primaryRemedy: { type: Type.STRING },
                remedyType: { type: Type.STRING },
                alternativeOptions: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            stage9: {
              type: Type.OBJECT,
              properties: {
                factors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                score: { type: Type.INTEGER },
                rating: { type: Type.STRING },
                limitationStatus: { type: Type.STRING },
                urgencyLevel: { type: Type.STRING }
              }
            },
            stage10: {
              type: Type.OBJECT,
              properties: {
                packageName: { type: Type.STRING },
                priceRange: { type: Type.STRING },
                description: { type: Type.STRING },
                deliverablesList: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            stage11: {
              type: Type.OBJECT,
              properties: {
                similarCasesCount: { type: Type.INTEGER },
                averageSimilarityScore: { type: Type.INTEGER },
                similarCases: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      caseName: { type: Type.STRING },
                      citationNumber: { type: Type.STRING },
                      court: { type: Type.STRING },
                      judge: { type: Type.STRING },
                      year: { type: Type.STRING },
                      state: { type: Type.STRING },
                      bench: { type: Type.STRING },
                      caseType: { type: Type.STRING },
                      similarityScore: { type: Type.INTEGER },
                      factsComparison: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            feature: { type: Type.STRING },
                            currentCase: { type: Type.STRING },
                            referenceCase: { type: Type.STRING },
                            match: { type: Type.BOOLEAN }
                          }
                        }
                      },
                      issuesCompared: { type: Type.ARRAY, items: { type: Type.STRING } },
                      legalPrinciples: { type: Type.ARRAY, items: { type: Type.STRING } },
                      courtReasoningSummary: { type: Type.STRING },
                      finalOutcome: { type: Type.STRING },
                      whyItMatters: { type: Type.STRING },
                      authoritiesCited: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  }
                },
                overallPrinciples: { type: Type.ARRAY, items: { type: Type.STRING } },
                successProbability: {
                  type: Type.OBJECT,
                  properties: {
                    percentage: { type: Type.INTEGER },
                    rating: { type: Type.STRING },
                    disclaimer: { type: Type.STRING }
                  }
                },
                authoritiesSummary: {
                  type: Type.OBJECT,
                  properties: {
                    supremeCourtCount: { type: Type.INTEGER },
                    highCourtCount: { type: Type.INTEGER },
                    governmentOrdersCount: { type: Type.INTEGER },
                    circularsCount: { type: Type.INTEGER },
                    statutesList: { type: Type.ARRAY, items: { type: Type.STRING } },
                    governmentOrders: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          orderNumber: { type: Type.STRING },
                          date: { type: Type.STRING },
                          department: { type: Type.STRING },
                          subject: { type: Type.STRING },
                          relevance: { type: Type.STRING }
                        }
                      }
                    },
                    circulars: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          circularNumber: { type: Type.STRING },
                          date: { type: Type.STRING },
                          department: { type: Type.STRING },
                          subject: { type: Type.STRING },
                          relevance: { type: Type.STRING }
                        }
                      }
                    }
                  }
                },
                strategyRecommendationFromPrecedents: { type: Type.STRING }
              }
            },
            stage12: {
              type: Type.OBJECT,
              properties: {
                strongestLegalRoute: {
                  type: Type.OBJECT,
                  properties: {
                    routeName: { type: Type.STRING },
                    routeType: { type: Type.STRING },
                    justification: { type: Type.STRING },
                    timeToResolutionEst: { type: Type.STRING }
                  }
                },
                mostPersuasivePrecedents: { type: Type.ARRAY, items: { type: Type.STRING } },
                evidenceGapsToFill: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      missingElement: { type: Type.STRING },
                      howToObtain: { type: Type.STRING },
                      urgency: { type: Type.STRING }
                    }
                  }
                },
                likelyOppositeCounterarguments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      argument: { type: Type.STRING },
                      rebuttalStrategy: { type: Type.STRING }
                    }
                  }
                },
                recommendedAdditionalProof: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      purpose: { type: Type.STRING }
                    }
                  }
                },
                priorityNextActions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stepNumber: { type: Type.INTEGER },
                      action: { type: Type.STRING },
                      targetAuthority: { type: Type.STRING },
                      timeline: { type: Type.STRING }
                    }
                  }
                }
              }
            },
            clientFacingReply: {
              type: Type.OBJECT,
              properties: {
                problemIdentified: { type: Type.STRING },
                legalPosition: { type: Type.STRING },
                immediateNextStep: { type: Type.STRING },
                expectedAuthority: { type: Type.STRING },
                estimatedTimeline: { type: Type.STRING }
              }
            },
            documentsRequired: {
              type: Type.OBJECT,
              properties: {
                mandatory: { type: Type.ARRAY, items: { type: Type.STRING } },
                revenue: { type: Type.ARRAY, items: { type: Type.STRING } },
                family: { type: Type.ARRAY, items: { type: Type.STRING } },
                court: { type: Type.ARRAY, items: { type: Type.STRING } },
                other: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            immediateAction: {
              type: Type.OBJECT,
              properties: {
                within24Hours: { type: Type.ARRAY, items: { type: Type.STRING } },
                within7Days: { type: Type.ARRAY, items: { type: Type.STRING } },
                within30Days: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            servicePackage: {
              type: Type.OBJECT,
              properties: {
                recommendedPackage: { type: Type.STRING },
                deliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
                professionalFee: { type: Type.STRING },
                expectedOutcome: { type: Type.STRING }
              }
            },
            customDocumentDraft: {
              type: Type.OBJECT,
              properties: {
                documentTitle: { type: Type.STRING },
                documentContent: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    const parsedData = cleanAndParseJson(response.text || "{}");
    if (parsedData?.stage11?.similarCases && Array.isArray(parsedData.stage11.similarCases)) {
      parsedData.stage11.similarCasesCount = parsedData.stage11.similarCases.length;
      parsedData.stage11.similarCases = parsedData.stage11.similarCases.map((item: any, idx: number) => ({
        ...item,
        id: item.id || `prec_${idx + 1}`
      }));
    }
    if (parsedData?.stage11?.authoritiesSummary) {
      const auth = parsedData.stage11.authoritiesSummary;
      auth.governmentOrders = Array.isArray(auth.governmentOrders) ? auth.governmentOrders : [];
      auth.circulars = Array.isArray(auth.circulars) ? auth.circulars : [];
      auth.governmentOrdersCount = auth.governmentOrders.length;
      auth.circularsCount = auth.circulars.length;
    }
    return jsonResponse(parsedData);
  } catch (error: any) {
    console.error("Analysis Error:", error);
    if (error?.message === "GEMINI_TIMEOUT" || error?.isTimeout) {
      return jsonResponse({
        error: "Analysis timed out",
        message: "The analysis took too long to complete. Please try again."
      }, 504);
    }
    return jsonResponse({ error: error.message || "Failed to analyze case." }, 500);
  }
};
