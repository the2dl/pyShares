--
-- PostgreSQL database dump
--

-- Dumped from database version 14.14 (Debian 14.14-1.pgdg120+1)
-- Dumped by pg_dump version 14.14 (Debian 14.14-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: fileshare_scanner
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO fileshare_scanner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: azure_config; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.azure_config (
    id integer NOT NULL,
    client_id character varying(255),
    tenant_id character varying(255),
    client_secret character varying(255),
    redirect_uri character varying(255),
    is_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer,
    allowed_groups text
);


ALTER TABLE public.azure_config OWNER TO fileshare_scanner;

--
-- Name: azure_config_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.azure_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.azure_config_id_seq OWNER TO fileshare_scanner;

--
-- Name: azure_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.azure_config_id_seq OWNED BY public.azure_config.id;


--
-- Name: root_files; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.root_files (
    id integer NOT NULL,
    share_id integer,
    file_name character varying(255) NOT NULL,
    file_type character varying(50),
    file_size bigint,
    attributes text[],
    created_time timestamp without time zone,
    modified_time timestamp without time zone
);


ALTER TABLE public.root_files OWNER TO fileshare_scanner;

--
-- Name: root_files_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.root_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.root_files_id_seq OWNER TO fileshare_scanner;

--
-- Name: root_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.root_files_id_seq OWNED BY public.root_files.id;


--
-- Name: scan_sessions; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.scan_sessions (
    id integer NOT NULL,
    domain character varying(255) NOT NULL,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    total_hosts integer DEFAULT 0,
    total_shares integer DEFAULT 0,
    total_sensitive_files integer DEFAULT 0,
    scan_status character varying(50) DEFAULT 'running'::character varying
);


ALTER TABLE public.scan_sessions OWNER TO fileshare_scanner;

--
-- Name: scan_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.scan_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.scan_sessions_id_seq OWNER TO fileshare_scanner;

--
-- Name: scan_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.scan_sessions_id_seq OWNED BY public.scan_sessions.id;


--
-- Name: sensitive_files; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.sensitive_files (
    id integer NOT NULL,
    share_id integer,
    file_path text NOT NULL,
    file_name character varying(255) NOT NULL,
    detection_type character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sensitive_files OWNER TO fileshare_scanner;

--
-- Name: sensitive_files_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.sensitive_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.sensitive_files_id_seq OWNER TO fileshare_scanner;

--
-- Name: sensitive_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.sensitive_files_id_seq OWNED BY public.sensitive_files.id;


--
-- Name: sensitive_patterns; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.sensitive_patterns (
    id integer NOT NULL,
    pattern character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sensitive_patterns OWNER TO fileshare_scanner;

--
-- Name: sensitive_patterns_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.sensitive_patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.sensitive_patterns_id_seq OWNER TO fileshare_scanner;

--
-- Name: sensitive_patterns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.sensitive_patterns_id_seq OWNED BY public.sensitive_patterns.id;


--
-- Name: setup_status; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.setup_status (
    id integer NOT NULL,
    is_completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.setup_status OWNER TO fileshare_scanner;

--
-- Name: setup_status_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.setup_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.setup_status_id_seq OWNER TO fileshare_scanner;

--
-- Name: setup_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.setup_status_id_seq OWNED BY public.setup_status.id;


--
-- Name: share_permissions; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.share_permissions (
    id integer NOT NULL,
    share_id integer,
    permission character varying(50)
);


ALTER TABLE public.share_permissions OWNER TO fileshare_scanner;

--
-- Name: share_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.share_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.share_permissions_id_seq OWNER TO fileshare_scanner;

--
-- Name: share_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.share_permissions_id_seq OWNED BY public.share_permissions.id;


--
-- Name: shares; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.shares (
    id integer NOT NULL,
    hostname character varying(255) NOT NULL,
    share_name character varying(255) NOT NULL,
    access_level character varying(50),
    error_message text,
    total_files integer DEFAULT 0,
    total_dirs integer DEFAULT 0,
    hidden_files integer DEFAULT 0,
    scan_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    session_id integer
);


ALTER TABLE public.shares OWNER TO fileshare_scanner;

--
-- Name: shares_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.shares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shares_id_seq OWNER TO fileshare_scanner;

--
-- Name: shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.shares_id_seq OWNED BY public.shares.id;


--
-- Name: stored_credentials; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.stored_credentials (
    id integer NOT NULL,
    domain character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    description character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    dc_ip character varying(255)
);


ALTER TABLE public.stored_credentials OWNER TO fileshare_scanner;

--
-- Name: stored_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.stored_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.stored_credentials_id_seq OWNER TO fileshare_scanner;

--
-- Name: stored_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.stored_credentials_id_seq OWNED BY public.stored_credentials.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: fileshare_scanner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    azure_id character varying(255),
    auth_provider character varying(50) DEFAULT 'local'::character varying,
    is_active boolean DEFAULT true,
    token_version integer DEFAULT 1
);


ALTER TABLE public.users OWNER TO fileshare_scanner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: fileshare_scanner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO fileshare_scanner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fileshare_scanner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: azure_config id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.azure_config ALTER COLUMN id SET DEFAULT nextval('public.azure_config_id_seq'::regclass);


--
-- Name: root_files id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.root_files ALTER COLUMN id SET DEFAULT nextval('public.root_files_id_seq'::regclass);


--
-- Name: scan_sessions id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.scan_sessions ALTER COLUMN id SET DEFAULT nextval('public.scan_sessions_id_seq'::regclass);


--
-- Name: sensitive_files id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.sensitive_files ALTER COLUMN id SET DEFAULT nextval('public.sensitive_files_id_seq'::regclass);


--
-- Name: sensitive_patterns id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.sensitive_patterns ALTER COLUMN id SET DEFAULT nextval('public.sensitive_patterns_id_seq'::regclass);


--
-- Name: setup_status id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.setup_status ALTER COLUMN id SET DEFAULT nextval('public.setup_status_id_seq'::regclass);


--
-- Name: share_permissions id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.share_permissions ALTER COLUMN id SET DEFAULT nextval('public.share_permissions_id_seq'::regclass);


--
-- Name: shares id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.shares ALTER COLUMN id SET DEFAULT nextval('public.shares_id_seq'::regclass);


--
-- Name: stored_credentials id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.stored_credentials ALTER COLUMN id SET DEFAULT nextval('public.stored_credentials_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: azure_config azure_config_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.azure_config
    ADD CONSTRAINT azure_config_pkey PRIMARY KEY (id);


--
-- Name: root_files root_files_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.root_files
    ADD CONSTRAINT root_files_pkey PRIMARY KEY (id);


--
-- Name: scan_sessions scan_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.scan_sessions
    ADD CONSTRAINT scan_sessions_pkey PRIMARY KEY (id);


--
-- Name: sensitive_files sensitive_files_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.sensitive_files
    ADD CONSTRAINT sensitive_files_pkey PRIMARY KEY (id);


--
-- Name: sensitive_patterns sensitive_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.sensitive_patterns
    ADD CONSTRAINT sensitive_patterns_pkey PRIMARY KEY (id);


--
-- Name: setup_status setup_status_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.setup_status
    ADD CONSTRAINT setup_status_pkey PRIMARY KEY (id);


--
-- Name: share_permissions share_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_pkey PRIMARY KEY (id);


--
-- Name: shares shares_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_pkey PRIMARY KEY (id);


--
-- Name: stored_credentials stored_credentials_domain_username_key; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.stored_credentials
    ADD CONSTRAINT stored_credentials_domain_username_key UNIQUE (domain, username);


--
-- Name: stored_credentials stored_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.stored_credentials
    ADD CONSTRAINT stored_credentials_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_scan_sessions_domain; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_scan_sessions_domain ON public.scan_sessions USING btree (domain);


--
-- Name: idx_scan_sessions_start_time; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_scan_sessions_start_time ON public.scan_sessions USING btree (start_time);


--
-- Name: idx_sensitive_files_detection_type; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_sensitive_files_detection_type ON public.sensitive_files USING btree (detection_type);


--
-- Name: idx_sensitive_files_share_id; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_sensitive_files_share_id ON public.sensitive_files USING btree (share_id);


--
-- Name: idx_sensitive_patterns_type; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_sensitive_patterns_type ON public.sensitive_patterns USING btree (type);


--
-- Name: idx_shares_hostname; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_shares_hostname ON public.shares USING btree (hostname);


--
-- Name: idx_shares_scan_time; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_shares_scan_time ON public.shares USING btree (scan_time);


--
-- Name: idx_shares_session_id; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_shares_session_id ON public.shares USING btree (session_id);


--
-- Name: idx_users_auth_provider; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_users_auth_provider ON public.users USING btree (auth_provider);


--
-- Name: idx_users_azure_id; Type: INDEX; Schema: public; Owner: fileshare_scanner
--

CREATE INDEX idx_users_azure_id ON public.users USING btree (azure_id);


--
-- Name: azure_config azure_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.azure_config
    ADD CONSTRAINT azure_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: root_files root_files_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.root_files
    ADD CONSTRAINT root_files_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.shares(id) ON DELETE CASCADE;


--
-- Name: sensitive_files sensitive_files_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.sensitive_files
    ADD CONSTRAINT sensitive_files_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.shares(id) ON DELETE CASCADE;


--
-- Name: share_permissions share_permissions_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.shares(id) ON DELETE CASCADE;


--
-- Name: shares shares_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fileshare_scanner
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.scan_sessions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--